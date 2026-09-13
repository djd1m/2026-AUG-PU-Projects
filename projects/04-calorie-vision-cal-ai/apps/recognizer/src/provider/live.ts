// `LiveModelProvider` — вторая реализация `ModelProvider` поверх Anthropic Messages API
// (vision + structured outputs), FR-scan-pipeline-13. Ключа на этой машине нет (DEC-A-009):
// «живое распознавание не выполнено: нет ключа» — состояние, а не пропуск. Живой режим НЕ
// является предметом тестов этой фичи.
//
// Схема ответа НЕ несёт `calories`/`kcal`/`protein`/`fat`/`carbs` (ADR-001) — только
// `items[]` (label_ru, mass_g, candidates ≤ 3), `confidence`, `model_estimate_kcal`.
// Скрытые повторы SDK отключены явно (`maxRetries: 0`, FR-scan-pipeline-6): единственный
// законный источник второго вызова на попытку — эскалация, не библиотека.

import Anthropic from '@anthropic-ai/sdk';
import {
  MODEL_RESPONSE_SCHEMA,
  ModelSchemaViolationError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from './types.js';

// Без `as const`: SDK ожидает МУТАБЕЛЬНЫЙ `Tool.InputSchema` (обычные `string[]`, не
// readonly-кортежи) — форма схемы от этого не меняется, только тип объявления в TS.
const RESPONSE_SCHEMA: Anthropic.Tool.InputSchema = {
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
      },
    },
    confidence: { type: 'number' },
    model_estimate_kcal: { type: 'number' },
  },
  required: ['items', 'confidence', 'model_estimate_kcal'],
};

// Ключи схемы НЕ объявляются здесь вторым списком: они СВЕРЯЮТСЯ с единственным
// объявлением `MODEL_RESPONSE_SCHEMA` (`types.ts`) при загрузке модуля. Без этой сверки
// схема жила бы в ДВУХ местах, и страж ADR-001, читающий одно из них, зеленел бы при
// `calories`, добавленном в другое (`foundation` держала это свойство тем, что схема
// приходила ПАРАМЕТРОМ; фича `scan-pipeline` вводит вторую, SDK-специфичную форму — она
// обязана оставаться производной, а не независимым источником).
{
  const declared = Object.keys((RESPONSE_SCHEMA.properties ?? {}) as Record<string, unknown>);
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

interface ParsedToolInput {
  readonly items: ReadonlyArray<{ readonly label_ru: string; readonly mass_g: number; readonly candidates: readonly string[] }>;
  readonly confidence: number;
  readonly model_estimate_kcal: number;
}

/**
 * RV-scan-pipeline-08: ПРЕЖНЯЯ версия делала `JSON.parse(raw) as {...}` — приведение ТИПОМ,
 * не проверка СТРУКТУРЫ, вне того же `try/catch`, что оборачивал HTTP-вызов. Отсутствующий
 * `items`/`candidates` в РЕАЛЬНОМ ответе бросал бы необработанный `TypeError` при `.map()`
 * дальше по функции — вызывающий код (`recognize-scan.ts`) классифицировал бы ЛЮБОЕ
 * исключение отсюда как `provider_unavailable`, теряя различие «схема нарушена»/«сеть
 * недоступна». Теперь разбор — ЯВНАЯ проверка из `unknown`, ВНУТРИ того же `try`, что и
 * вызов, и бросает `ModelSchemaViolationError` (RV-scan-pipeline-10 тоже её требует —
 * гарантия, что диапазоны и типы проверяются кодом, а не угадываются приведением).
 */
function parseToolInput(value: unknown): ParsedToolInput {
  if (typeof value !== 'object' || value === null) throw new ModelSchemaViolationError('root');
  const record = value as Record<string, unknown>;

  if (!Array.isArray(record.items)) throw new ModelSchemaViolationError('items');
  const items = record.items.map((rawItem, index): ParsedToolInput['items'][number] => {
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

export interface ImageFetcher {
  /** Загружает нормализованную копию по ключу и возвращает base64 + mime. */
  fetchBase64(imageKey: string): Promise<{ base64: string; mime: 'image/jpeg' }>;
}

export function createLiveModelProvider(apiKey: string, images: ImageFetcher): ModelProvider {
  // `maxRetries: 0` — FR-scan-pipeline-6: единственный второй вызов на попытку — эскалация.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  return {
    kind: 'live',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      const image = await images.fetchBase64(request.imageKey);

      // RV-scan-pipeline-08: разбор и валидация СТРУКТУРЫ — ВНУТРИ ТОГО ЖЕ try/catch, что и
      // сетевой вызов, чтобы `ModelSchemaViolationError` (нарушение схемы) не смешивалась с
      // `ProviderUnavailableError` (сеть/транспорт) — они различаются ниже явной проверкой
      // типа исключения, а не угадываются по тому, где код упал.
      try {
        const response = await client.messages.create(
          {
            model: request.model === 'sonnet-5' ? 'claude-sonnet-5' : 'claude-haiku-4-5',
            max_tokens: 1024,
            tools: [
              {
                name: 'report_ingredients',
                description: 'Сообщить распознанные ингредиенты по строгой схеме',
                input_schema: RESPONSE_SCHEMA,
              },
            ],
            tool_choice: { type: 'tool', name: 'report_ingredients' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
                  {
                    type: 'text',
                    text: 'Определи ингредиенты и массу порции на фото. Не оценивай калорийность как результат — только как model_estimate_kcal.',
                  },
                ],
              },
            ],
          },
          { signal: request.signal, timeout: request.deadlineMs },
        );
        const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (toolUse === undefined) throw new ModelSchemaViolationError('нет structured-output блока в ответе');
        const parsed = parseToolInput(toolUse.input);

        return {
          items: parsed.items.map((item) => ({ labelRu: item.label_ru, massG: item.mass_g, candidates: item.candidates })),
          confidence: parsed.confidence,
          modelEstimateKcal: parsed.model_estimate_kcal,
          model: request.model,
        };
      } catch (error) {
        if (error instanceof ModelSchemaViolationError) throw error;
        throw new ProviderUnavailableError(error);
      }
    },
  };
}
