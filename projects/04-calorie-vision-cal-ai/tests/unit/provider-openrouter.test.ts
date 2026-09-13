// `OpenRouterModelProvider` (DEC-A-045, DEC-A-046) — ТРЕТЬЯ реализация `ModelProvider`.
// Сеть перехвачена ЦЕЛИКОМ: `globalThis.fetch` подменён на всех прогонах, реального
// обращения к `openrouter.ai` здесь нет (`testing.md`: «тесты не ходят в интернет»).

import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenRouterModelProvider, ProviderUnavailableError } from '../../apps/recognizer/src/provider/openrouter.js';
import {
  MODEL_RESPONSE_SCHEMA,
  ModelCallAborted,
  ModelDeadlineExceeded,
  ModelSchemaViolationError,
  type ModelCallOptions,
  type ModelImage,
} from '../../apps/recognizer/src/provider/types.js';
import type { ImageFetcher } from '../../apps/recognizer/src/provider/live.js';

const IMAGE: ModelImage = { scanId: '11111111-2222-3333-4444-555555555555', imageKey: 'photos/a.jpg' };
const CALL: ModelCallOptions = { model: 'haiku-4.5', deadlineMs: 30_000, signal: new AbortController().signal };

function request(overrides: Partial<ModelImage & ModelCallOptions> = {}) {
  return { ...IMAGE, schema: MODEL_RESPONSE_SCHEMA, ...CALL, ...overrides };
}

const STUB_IMAGES: ImageFetcher = { fetchBase64: () => Promise.resolve({ base64: 'ZmFrZQ==', mime: 'image/jpeg' as const }) };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function okBody(overrides: Partial<{ items: unknown; confidence: unknown; model_estimate_kcal: unknown }> = {}): unknown {
  const content = JSON.stringify({
    items: [{ label_ru: 'гречка отварная', mass_g: 150, candidates: [] }],
    confidence: 0.8,
    model_estimate_kcal: 220,
    ...overrides,
  });
  return { choices: [{ message: { content } }] };
}

function abortLikeError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Обычный сетевой сбой — НЕ abort: DNS, обрыв соединения и т.п. */
function transportError(): Error {
  return new Error('fetch failed: ECONNREFUSED');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('поставщик модели openrouter', () => {
  it('успешный ответ разбирается, model в ответе — эхо запрошенной роли', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(okBody()));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const response = await provider.recognize(request({ model: 'haiku-4.5' }));

    expect(response.model).toBe('haiku-4.5');
    expect(response.items).toEqual([{ labelRu: 'гречка отварная', massG: 150, candidates: [] }]);
    expect(response.confidence).toBe(0.8);
    expect(response.modelEstimateKcal).toBe(220);

    // Носитель роли (DEC-A-045) — закрытое отображение, проверяется ПО ФАКТИЧЕСКИ
    // отправленному телу запроса, а не по памяти реализации.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    const sentBody = JSON.parse(init.body as string) as { model: string };
    expect(sentBody.model).toBe('openai/gpt-5-nano');
  });

  it('эскалация (sonnet-5) уходит на другой носитель — не тот же, что основной вызов (DEC-A-045)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(okBody()));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const response = await provider.recognize(request({ model: 'sonnet-5' }));

    expect(response.model).toBe('sonnet-5');
    const sentBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { model: string };
    expect(sentBody.model).toBe('openai/gpt-5-mini');
    expect(sentBody.model).not.toBe('openai/gpt-5-nano'); // разные носители у разных ролей
  });

  it('тело 200 OK с error вместо choices — НЕ успех, а недоступность провайдера', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'rate limited upstream', code: 429 } }, 200)));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    await expect(provider.recognize(request())).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('отсутствующее поле схемы даёт ModelSchemaViolationError с именем поля', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okBody({ confidence: undefined }))));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const error = await provider.recognize(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelSchemaViolationError);
    expect((error as ModelSchemaViolationError).field).toBe('confidence');
  });

  it('нечисловое поле схемы даёт ModelSchemaViolationError с именем поля', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okBody({ model_estimate_kcal: 'много' }))));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const error = await provider.recognize(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelSchemaViolationError);
    expect((error as ModelSchemaViolationError).field).toBe('model_estimate_kcal');
  });

  it('нарушение схемы во вложенном поле называет путь до него', async () => {
    const content = JSON.stringify({ items: [{ label_ru: 'борщ', mass_g: 'много', candidates: [] }], confidence: 0.5, model_estimate_kcal: 100 });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [{ message: { content } }] })));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const error = await provider.recognize(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelSchemaViolationError);
    expect((error as ModelSchemaViolationError).field).toBe('items[0].mass_g');
  });

  it('HTTP 429 и 5xx — ProviderUnavailableError, НЕ схема', async () => {
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'upstream busy' }, status)));
      const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
      const error = await provider.recognize(request()).catch((e: unknown) => e);
      expect(error, `status ${status}`).toBeInstanceOf(ProviderUnavailableError);
    }
  });

  it('HTTP 400 — нарушение схемы, а не транспортный сбой', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'schema rejected' }, 400)));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    await expect(provider.recognize(request())).rejects.toBeInstanceOf(ModelSchemaViolationError);
  });

  it('сетевой сбой транспорта (не abort) — ProviderUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(transportError())));
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    await expect(provider.recognize(request())).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('уже отменённая или уже просроченная операция не начинается вовсе', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);

    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.recognize(request({ signal: aborted.signal }))).rejects.toBeInstanceOf(ModelCallAborted);

    await expect(provider.recognize(request({ deadlineMs: 0 }))).rejects.toBeInstanceOf(ModelDeadlineExceeded);

    expect(fetchMock).not.toHaveBeenCalled(); // ни один из двух случаев не дошёл до сети
  });

  it('истечение дедлайна прерывает запрос: fetch получает СРАБОТАВШИЙ сигнал', async () => {
    // Мок ведёт себя как настоящий fetch: висит, пока не сработает переданный signal, и
    // тогда отклоняется тем же AbortError, что и платформенный fetch.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) {
            reject(abortLikeError());
            return;
          }
          signal.addEventListener('abort', () => reject(abortLikeError()), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    await expect(provider.recognize(request({ deadlineMs: 15, signal: new AbortController().signal }))).rejects.toBeInstanceOf(
      ModelDeadlineExceeded,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(sentSignal.aborted).toBe(true); // fetch реально получил сработавший сигнал
  });

  it('вызов прерывается ОБЩИМ сигналом отмены и не возвращает результата; fetch получает СРАБОТАВШИЙ сигнал', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) {
            reject(abortLikeError());
            return;
          }
          signal.addEventListener('abort', () => reject(abortLikeError()), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenRouterModelProvider('sk-or-test', STUB_IMAGES);
    const controller = new AbortController();
    const call = provider.recognize(request({ deadlineMs: 30_000, signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);

    await expect(call).rejects.toBeInstanceOf(ModelCallAborted);
    const sentSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(sentSignal.aborted).toBe(true);
  });

  /**
   * Страж по исходнику (`guard-must-be-able-to-fail.md`): проверка сверки production
   * JSON-схемы с ЕДИНСТВЕННЫМ объявлением `MODEL_RESPONSE_SCHEMA` — не текстовым regex-ем
   * (тот живёт в `tests/unit/source-guards.test.ts`, рядом с тем же стражем для `live.ts`),
   * а РЕАЛЬНЫМ динамическим импортом мутированной копии модуля: расхождение обязано
   * валить ЗАГРУЗКУ МОДУЛЯ, а не только совпадать с шаблоном в тексте файла.
   */
  it('расхождение JSON-схемы с MODEL_RESPONSE_SCHEMA валит загрузку модуля (испытано мутацией, реальный импорт)', async () => {
    const sourcePath = fileURLToPath(new URL('../../apps/recognizer/src/provider/openrouter.ts', import.meta.url));
    const providerDir = path.dirname(sourcePath);
    const original = await readFile(sourcePath, 'utf8');

    // Мутация: убрать `model_estimate_kcal` из ОБЪЯВЛЕННОЙ JSON-схемы — тем самым разойтись
    // с MODEL_RESPONSE_SCHEMA.fields по КОЛИЧЕСТВУ ключей. Мутация — в ПАМЯТИ; временный
    // файл кладётся РЯДОМ (тот же каталог), чтобы относительные импорты `./types.js` и
    // `./live.js` разрешились без изменений, и удаляется в finally независимо от исхода.
    const mutated = original.replace(
      "    confidence: { type: 'number' },\n    model_estimate_kcal: { type: 'number' },\n  },",
      "    confidence: { type: 'number' },\n  },",
    );
    expect(mutated).not.toBe(original); // подтверждает, что замена реально произошла

    const fixturePath = path.join(providerDir, `__guard-fixture-${randomUUID()}.ts`);
    await writeFile(fixturePath, mutated, 'utf8');
    try {
      // КРАСНЫЙ на дефекте: загрузка мутированного модуля обязана бросить синхронно при
      // импорте — это и есть «расхождение валит загрузку модуля», а не поведение вызова.
      await expect(import(`${fixturePath}?guard=${randomUUID()}`)).rejects.toThrow(/схема ответа расходится с MODEL_RESPONSE_SCHEMA/);
    } finally {
      await rm(fixturePath, { force: true });
    }

    // ЗЕЛЁНЫЙ после восстановления: настоящий файл (без мутации) загружается без ошибки —
    // страж, никогда не показывавший ни одного из двух состояний, стражем не является.
    await expect(import('../../apps/recognizer/src/provider/openrouter.js')).resolves.toBeDefined();
  });
});
