// `OpenRouterModelProvider` — ТРЕТЬЯ реализация `ModelProvider` (DEC-A-045, DEC-A-046),
// протокол OpenAI-совместимый через `https://openrouter.ai/api/v1/chat/completions`.
//
// ОГРАНИЧЕНИЕ DEC-A-046, и это не формальность: фото еды — специальная категория ПДн
// (ADR-009). Этот адаптер отправляет фото СТОРОННЕМУ обработчику — OpenRouter
// МАРШРУТИЗИРУЕТ запрос к поставщику модели, и список обработчиков переменный. Текст
// согласия `2026-09-v1` называет обработку сервисом «Тарелка» и НЕ называет стороннего
// обработчика. Адаптер можно поставлять заранее — включение на живых пользователях
// (`N4_MODEL_PROVIDER=openrouter`) требует ЛИБО новой версии текста согласия, называющей
// обработчика, ЛИБО решения владельца остаться у одного обработчика (Anthropic, `live.ts`).
// По умолчанию поставщик остаётся `fake` (`docker-compose.yml`, `.env.example`).
//
// Схема ответа НЕ несёт `calories`/`kcal`/`protein`/`fat`/`carbs` (ADR-001) — только
// `items[]` (label_ru, mass_g, candidates ≤ 3), `confidence`, `model_estimate_kcal`, как у
// `live.ts`. Одна попытка на вызов: скрытых повторов здесь нет вовсе (FR-scan-pipeline-6) —
// единственный законный источник второго вызова на попытку — эскалация вызывающего кода,
// не библиотека и не сетевой клиент.

import {
  MODEL_IDS,
  MODEL_RESPONSE_SCHEMA,
  ModelCallAborted,
  ModelDeadlineExceeded,
  ModelSchemaViolationError,
  type ModelId,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from './types.js';
import type { ImageFetcher } from './live.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Отображение ролей канона на модели-носители OpenRouter — ЗАКРЫТЫЙ набор, живёт в КОДЕ
 * (DEC-A-045, `honest-configuration` CFG-I8), не в окружении. Роли канона — `haiku-4.5`
 * (основной вызов) и `sonnet-5` (эскалация при уверенности < 0,6, ADR-004) — НЕ меняются;
 * меняется только НОСИТЕЛЬ, на котором роль исполняется. Эскалация на ТУ ЖЕ модель, что и
 * основной вызов, была бы вторым оплаченным вызовом без шанса на другой ответ — то есть
 * тратой без смысла, — поэтому носители эскалации и основного вызова обязаны различаться.
 * Цены сняты 2026-09-13 (`docs/operations/model-provider-options.md`): `gpt-5-nano`
 * 0,05/0,40 $ за млн токенов, `gpt-5-mini` 0,25/2,00 $ — обе со structured outputs и зрением.
 */
const ROLE_TO_OPENROUTER_MODEL: Readonly<Record<ModelId, string>> = {
  'haiku-4.5': 'openai/gpt-5-nano',
  'sonnet-5': 'openai/gpt-5-mini',
};

// Проверка ЗАКРЫТОСТИ отображения при загрузке модуля: каждая роль канона (`MODEL_IDS`)
// обязана иметь носителя, и лишних ролей в отображении быть не должно — иначе оно молча
// разошлось бы с канонoм §6 при следующем изменении ролей.
{
  const mapped = Object.keys(ROLE_TO_OPENROUTER_MODEL).sort();
  const canonical = [...MODEL_IDS].sort();
  if (mapped.length !== canonical.length || mapped.some((role, index) => role !== canonical[index])) {
    throw new Error(`ROLE_TO_OPENROUTER_MODEL расходится с MODEL_IDS: здесь ${mapped.join()}, в types.ts ${canonical.join()}`);
  }
}

// Строгая JSON-схема (structured outputs, `response_format: json_schema`, `strict: true`).
// Форма — производная от `MODEL_RESPONSE_SCHEMA` (`types.ts`), сверка ниже, ровно как в
// `live.ts` сверяет свою `RESPONSE_SCHEMA` с тем же объявлением: два независимых
// объявления схемы обошли бы страж ADR-001, читающий только одно место.
const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          label_ru: { type: 'string' },
          mass_g: { type: 'number' },
          candidates: { type: 'array', maxItems: 3, items: { type: 'string' } },
        },
        required: ['label_ru', 'mass_g', 'candidates'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'number' },
    model_estimate_kcal: { type: 'number' },
  },
  required: ['items', 'confidence', 'model_estimate_kcal'],
  additionalProperties: false,
} as const;

// Ключи схемы НЕ объявляются вторым списком: они СВЕРЯЮТСЯ с единственным объявлением
// `MODEL_RESPONSE_SCHEMA` при загрузке модуля (та же форма, что у `live.ts`).
{
  const declared = Object.keys(RESPONSE_JSON_SCHEMA.properties);
  const canonical = [...MODEL_RESPONSE_SCHEMA.fields];
  if (declared.length !== canonical.length || declared.some((field, index) => field !== canonical[index])) {
    throw new Error(
      `схема ответа расходится с MODEL_RESPONSE_SCHEMA: здесь ${declared.join()}, в types.ts ${canonical.join()}`,
    );
  }
}

export class ProviderUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`провайдер недоступен: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'ProviderUnavailableError';
  }
}

interface ParsedResponseBody {
  readonly items: ReadonlyArray<{ readonly label_ru: string; readonly mass_g: number; readonly candidates: readonly string[] }>;
  readonly confidence: number;
  readonly model_estimate_kcal: number;
}

/**
 * Разбор из `unknown` через ЯВНЫЕ проверки, а не приведение типом (RV-scan-pipeline-08,
 * та же граница, что в `live.ts`): нарушение схемы бросает `ModelSchemaViolationError` с
 * именем поля, а не роняет процесс необработанным `TypeError` дальше по стеку.
 */
function parseRecognitionPayload(value: unknown): ParsedResponseBody {
  if (typeof value !== 'object' || value === null) throw new ModelSchemaViolationError('root');
  const record = value as Record<string, unknown>;

  if (!Array.isArray(record.items)) throw new ModelSchemaViolationError('items');
  const items = record.items.map((rawItem, index): ParsedResponseBody['items'][number] => {
    if (typeof rawItem !== 'object' || rawItem === null) throw new ModelSchemaViolationError(`items[${index}]`);
    const item = rawItem as Record<string, unknown>;
    if (typeof item.label_ru !== 'string') throw new ModelSchemaViolationError(`items[${index}].label_ru`);
    if (typeof item.mass_g !== 'number') throw new ModelSchemaViolationError(`items[${index}].mass_g`);
    if (!Array.isArray(item.candidates) || !item.candidates.every((c): c is string => typeof c === 'string')) {
      throw new ModelSchemaViolationError(`items[${index}].candidates`);
    }
    return { label_ru: item.label_ru, mass_g: item.mass_g, candidates: item.candidates };
  });

  if (typeof record.confidence !== 'number') throw new ModelSchemaViolationError('confidence');
  if (typeof record.model_estimate_kcal !== 'number') throw new ModelSchemaViolationError('model_estimate_kcal');

  return { items, confidence: record.confidence, model_estimate_kcal: record.model_estimate_kcal };
}

/**
 * Тело ответа OpenRouter разбирается ЦЕЛИКОМ явными проверками, ПРЕЖДЕ чем добраться до
 * `parseRecognitionPayload`: `200 OK` может нести `error` ВМЕСТО `choices` — это НЕ успех,
 * а недоступность провайдера, и её нельзя перепутать с «структура ответа не распознана»
 * (та же граница RV-scan-pipeline-08, что у нарушения схемы).
 */
function extractContent(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw new ProviderUnavailableError(new Error('ответ openrouter не является объектом'));
  }
  const record = body as Record<string, unknown>;

  // Тело `200 OK` c `error` вместо `choices` — задокументированное поведение OpenRouter,
  // а не пограничный случай: провайдер сообщает отказ ВНУТРИ успешного HTTP-статуса.
  if ('error' in record) {
    throw new ProviderUnavailableError(new Error(`openrouter вернул error в теле 200: ${JSON.stringify(record.error)}`));
  }

  if (!Array.isArray(record.choices) || record.choices.length === 0) {
    throw new ProviderUnavailableError(new Error('в ответе openrouter нет choices'));
  }
  const first = record.choices[0];
  if (typeof first !== 'object' || first === null) {
    throw new ProviderUnavailableError(new Error('choices[0] не является объектом'));
  }
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    throw new ProviderUnavailableError(new Error('choices[0].message отсутствует'));
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== 'string') throw new ModelSchemaViolationError('choices[0].message.content');
  return content;
}

/**
 * Комбинирует ОБА способа оборвать запрос — внешний `request.signal` (общий сигнал
 * операции) и `request.deadlineMs` (бюджет ЭТОГО вызова) — так, чтобы каждый реально
 * прерывал `fetch`, а не только замерялся постфактум. `AbortSignal.any` — если доступен
 * в рантайме (Node 22); иначе свой комбинатор, где таймер СНИМАЕТСЯ в `finally`
 * вызывающего кода, чтобы не держать процесс дольше живого запроса.
 */
function combineDeadlineWithSignal(
  signal: AbortSignal,
  deadlineMs: number,
): { readonly signal: AbortSignal; readonly deadlineFired: () => boolean; readonly cleanup: () => void } {
  let firedByDeadline = false;
  const deadlineController = new AbortController();
  const timer = setTimeout(() => {
    firedByDeadline = true;
    deadlineController.abort();
  }, deadlineMs);

  const combined =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, deadlineController.signal])
      : (() => {
          const controller = new AbortController();
          const abortCombined = (): void => controller.abort();
          if (signal.aborted || deadlineController.signal.aborted) controller.abort();
          signal.addEventListener('abort', abortCombined, { once: true });
          deadlineController.signal.addEventListener('abort', abortCombined, { once: true });
          return controller.signal;
        })();

  return {
    signal: combined,
    deadlineFired: () => firedByDeadline,
    cleanup: () => clearTimeout(timer),
  };
}

export function createOpenRouterModelProvider(apiKey: string, images: ImageFetcher): ModelProvider {
  return {
    kind: 'openrouter',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      // Отмена и истёкший бюджет проверяются ПЕРВЫМИ, до единственной попытки: уже
      // отменённая или уже просроченная операция не начинается вовсе (та же форма, что у
      // `fake.ts`).
      if (request.signal.aborted) throw new ModelCallAborted();
      if (!Number.isFinite(request.deadlineMs) || request.deadlineMs <= 0) throw new ModelDeadlineExceeded(request.deadlineMs);

      const image = await images.fetchBase64(request.imageKey);
      const dataUri = `data:${image.mime};base64,${image.base64}`;

      const { signal: combinedSignal, deadlineFired, cleanup } = combineDeadlineWithSignal(request.signal, request.deadlineMs);
      try {
        let response: Response;
        try {
          response = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: ROLE_TO_OPENROUTER_MODEL[request.model],
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Определи ингредиенты и массу порции на фото. Не оценивай калорийность как результат — только как model_estimate_kcal.',
                    },
                    { type: 'image_url', image_url: { url: dataUri } },
                  ],
                },
              ],
              response_format: {
                type: 'json_schema',
                json_schema: { name: MODEL_RESPONSE_SCHEMA.name, strict: true, schema: RESPONSE_JSON_SCHEMA },
              },
            }),
            signal: combinedSignal,
          });
        } catch (error) {
          // `fetch` бросает `AbortError`, когда ЛЮБОЙ из двух объединённых сигналов сорвал
          // запрос. Различаем ПО ИСТОЧНИКУ, а не по имени исключения: имя одно на оба случая.
          if (deadlineFired()) throw new ModelDeadlineExceeded(request.deadlineMs);
          if (request.signal.aborted) throw new ModelCallAborted();
          throw new ProviderUnavailableError(error);
        }

        // 429 и 5xx — недоступность провайдера. 400 в этом адаптере означает ТОЛЬКО одно:
        // запрос отвергнут по форме (наш запрос собран из закрытого набора значений и не
        // содержит пользовательского произвола) — нарушение схемы, а не транспортный сбой.
        if (response.status === 400) {
          throw new ModelSchemaViolationError(`openrouter отклонил запрос по схеме: HTTP 400`);
        }
        if (!response.ok) {
          throw new ProviderUnavailableError(new Error(`openrouter HTTP ${response.status}`));
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          throw new ProviderUnavailableError(error);
        }

        const content = extractContent(body);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(content);
        } catch {
          throw new ModelSchemaViolationError('choices[0].message.content: не JSON');
        }
        const parsed = parseRecognitionPayload(parsedJson);

        return {
          model: request.model,
          items: parsed.items.map((item) => ({ labelRu: item.label_ru, massG: item.mass_g, candidates: item.candidates })),
          confidence: parsed.confidence,
          modelEstimateKcal: parsed.model_estimate_kcal,
        };
      } finally {
        cleanup();
      }
    },
  };
}
