// Адаптер поставщика модели (AC-foundation-11, AC-foundation-19).
//
// Три свойства порта проверяются отдельно, потому что каждое стоит своих денег:
// детерминизм фейка, ВЫБОР МОДЕЛИ вызывающим и ЧЕСТНЫЙ ОТКАЗ по дедлайну.

import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { ConfigValidationError } from '@n4/shared';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { selectModelProvider } from '../../apps/recognizer/src/provider/select.js';
import { LiveProviderNotImplemented } from '../../apps/recognizer/src/provider/live.js';
import {
  MODEL_RESPONSE_SCHEMA,
  ModelDeadlineExceeded,
  type ModelCallOptions,
  type ModelImage,
} from '../../apps/recognizer/src/provider/types.js';
import { loadRecognizerConfig } from '../../apps/recognizer/src/env.js';

const BASE_ENV: Record<string, string | undefined> = {
  DATABASE_URL: 'postgresql://n4_app:secret@db:5432/n4',
  S3_ENDPOINT: 'http://storage:9000',
  S3_BUCKET: 'n4-photos',
  S3_ACCESS_KEY: 'access-key-value',
  S3_SECRET_KEY: 'secret-key-value',
  N4_SCAN_LIMIT_USER: '10',
  N4_SCAN_LIMIT_DAY: '3000',
  N4_ESCALATION_LIMIT_DAY: '600',
  N4_MODEL_PROVIDER: 'fake',
  ANTHROPIC_API_KEY: '',
};

const IMAGE: ModelImage = { scanId: '11111111-2222-3333-4444-555555555555', objectKey: 'photos/a.jpg' };
const CALL: ModelCallOptions = { model: 'haiku-4.5', deadlineMs: 30_000, signal: new AbortController().signal };

const LIVE_CONFIG = {
  databaseUrl: 'x',
  storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
  quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
  modelProvider: 'live' as const,
};

describe('поставщик модели', () => {
  it('фейковый адаптер детерминирован и не ходит в сеть', async () => {
    const provider = createFakeModelProvider();

    // Сеть перехвачена: любое обращение наружу провалит тест, а не останется незамеченным.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const first = await provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, CALL);
    const second = await provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, CALL);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(second).toEqual(first);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.items.length).toBeGreaterThan(0);

    // Разный вход — разный ответ: детерминизм не означает «всегда одно и то же».
    const other = await provider.recognize({ ...IMAGE, objectKey: 'photos/b.jpg' }, MODEL_RESPONSE_SCHEMA, CALL);
    expect(other).not.toEqual(first);
  });

  it('модель выбирает вызывающий, и ответ сам называет, чей он', async () => {
    const provider = createFakeModelProvider();

    const primary = await provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 30_000, signal: new AbortController().signal });
    const escalated = await provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'sonnet-5', deadlineMs: 30_000, signal: new AbortController().signal });

    // Эхо модели обязательно: иначе «о какой модели этот ответ» восстанавливается по
    // памяти вызывающего, и потолок эскалаций не с чем сопоставить.
    expect(primary.model).toBe('haiku-4.5');
    expect(escalated.model).toBe('sonnet-5');
    // Ответ РАЗНЫХ моделей на один кадр обязан различаться, иначе тест эскалации слеп.
    expect(escalated).not.toEqual(primary);
  });

  it('фейковый адаптер уважает дедлайн и отказывает, а не отвечает поздно', async () => {
    // Истёкший бюджет — отказ ДО работы. Ноль и отрицательное значение означают «поздно».
    const instant = createFakeModelProvider();
    for (const deadlineMs of [0, -1, Number.NaN]) {
      await expect(instant.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs, signal: new AbortController().signal })).rejects.toBeInstanceOf(
        ModelDeadlineExceeded,
      );
    }

    // Работа дольше бюджета — тоже отказ, а не поздний ответ: поздний ответ всё равно
    // оплачен и всё равно выбрасывается, и честнее сказать об этом сразу.
    const slow = createFakeModelProvider({ latencyMs: 60 });
    await expect(slow.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 20, signal: new AbortController().signal })).rejects.toBeInstanceOf(
      ModelDeadlineExceeded,
    );

    // Работа в пределах бюджета — обычный ответ.
    const fits = await slow.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 5_000, signal: new AbortController().signal });
    expect(fits.model).toBe('haiku-4.5');

    // ДРОБНЫЙ бюджет — воспроизведение шестого слепого ревью (RV-foundation-01) буквально.
    // Ожидание урезается до бюджета, а таймер с дробным сроком просыпается чуть РАНЬШЕ
    // него, поэтому проверка по часам проходит, хотя запрошенная работа в 1000 мс не
    // выполнена: двадцать вызовов из двадцати возвращали УСПЕХ. Прогонов двадцать, а не
    // один, именно потому, что дефект вероятностный: округление вниз случается не всегда,
    // и единственный прогон зеленел бы через раз.
    const tooSlow = createFakeModelProvider({ latencyMs: 1_000 });
    for (let i = 0; i < 20; i += 1) {
      await expect(
        tooSlow.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 5.9, signal: new AbortController().signal }),
      ).rejects.toBeInstanceOf(ModelDeadlineExceeded);
    }

    // Бюджет, истекающий ВО ВРЕМЯ ФОРМИРОВАНИЯ ответа, — седьмое слепое ревью
    // (RV-foundation-01). Задержки нет вовсе, но SHA-256 и сборка объекта сами занимают
    // время: при бюджете 0,01 мс судья намерил 16 успехов из 20 ПОСЛЕ дедлайна. Ловится
    // только проверкой, стоящей непосредственно перед `return`.
    const instantProvider = createFakeModelProvider();
    for (let i = 0; i < 20; i += 1) {
      await expect(
        instantProvider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 0.01, signal: new AbortController().signal }),
      ).rejects.toBeInstanceOf(ModelDeadlineExceeded);
    }
  });

  it('задержанный таймер не превращает просроченный вызов в поздний успех', async () => {
    // Воспроизведение слепого ревью (RV-foundation-02) БУКВАЛЬНО: задержка 10 мс, бюджет
    // 20 мс, цикл событий занят 80 мс СИНХРОННО. Таймер просыпается не в свой срок, а когда
    // освободится цикл, — и прежняя проверка `latencyMs > deadlineMs` (сравнение двух
    // ВХОДНЫХ чисел) пропускала успешный ответ через 81 мс при бюджете 20.
    //
    // Соседний тест этого не ловит: там превышение задано заранее самими числами, а здесь
    // числа «укладываются» и бюджет съедает ФАКТИЧЕСКОЕ время.
    const provider = createFakeModelProvider({ latencyMs: 10 });
    const startedAt = performance.now();
    const call = provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, {
      model: 'haiku-4.5',
      deadlineMs: 20,
      // Сигнал НЕ срабатывает: порт обязан соблюдать переданный бюджет сам, а не ждать,
      // пока его оборвут снаружи.
      signal: new AbortController().signal,
    });

    // Синхронная занятость — ровно то, что делает таймер поздним. `await` здесь неуместен:
    // он вернул бы управление циклу и дефект не проявился бы.
    const busyUntil = performance.now() + 80;
    while (performance.now() < busyUntil) {
      /* цикл событий занят: ни один таймер не исполняется */
    }

    await expect(call).rejects.toBeInstanceOf(ModelDeadlineExceeded);
    // Отказ пришёл ПОСЛЕ дедлайна — значит проверено истёкшее время, а не входные числа.
    expect(performance.now() - startedAt).toBeGreaterThan(20);
  });

  it('вызов прерывается общим сигналом отмены и не возвращает результата', async () => {
    // Уже отменённая операция не начинается вовсе.
    const instant = createFakeModelProvider();
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      instant.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 30_000, signal: aborted.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // Отмена ВО ВРЕМЯ работы обрывает её НЕМЕДЛЕННО, а не досиживает свой таймер: в этом и
    // смысл общего сигнала — платная работа прекращается в момент отмены.
    const slow = createFakeModelProvider({ latencyMs: 5_000 });
    const controller = new AbortController();
    const started = Date.now();
    const call = slow.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, { model: 'haiku-4.5', deadlineMs: 30_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('режим live без ключа валит старт воркера', () => {
    let refusal: ConfigValidationError | undefined;
    try {
      loadRecognizerConfig({ ...BASE_ENV, N4_MODEL_PROVIDER: 'live' });
    } catch (error) {
      refusal = error as ConfigValidationError;
    }
    expect(refusal).toBeInstanceOf(ConfigValidationError);
    expect(refusal?.variables).toContain('ANTHROPIC_API_KEY');

    // А если валидатор кто-то обойдёт — отказывает и выбор реализации.
    expect(() => selectModelProvider({ ...LIVE_CONFIG, anthropicApiKey: undefined })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('живой поставщик в этой фиче не реализован и говорит об этом явно', async () => {
    const provider = selectModelProvider({ ...LIVE_CONFIG, anthropicApiKey: 'sk-test-value' });
    expect(provider.kind).toBe('live');
    // Тихо вернуть пустой ответ нельзя: он неотличим от разбора пустой тарелки.
    await expect(provider.recognize(IMAGE, MODEL_RESPONSE_SCHEMA, CALL)).rejects.toBeInstanceOf(LiveProviderNotImplemented);
  });

  it('режим fake выбирается только явным значением конфигурации', () => {
    const config = loadRecognizerConfig(BASE_ENV);
    expect(selectModelProvider(config).kind).toBe('fake');
  });
});
