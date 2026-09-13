// Адаптер поставщика модели (AC-foundation-11, AC-foundation-19 → расширен фичей
// `scan-pipeline`, FR-scan-pipeline-13).
//
// Свойства порта проверяются ПОРОЗНЬ, потому что каждое стоит своих денег: детерминизм
// фейка, ВЫБОР МОДЕЛИ вызывающим, ЧЕСТНЫЙ ОТКАЗ по дедлайну — и, начиная с этой фичи,
// СОБИРАЕМОСТЬ живого поставщика: `LiveModelProvider` теперь РЕАЛИЗОВАН, то есть вводит
// вызовы наружу, которых `foundation` сознательно не делала (DEC-A-009).

import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { ConfigValidationError } from '@n4/shared';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { selectModelProvider } from '../../apps/recognizer/src/provider/select.js';
import {
  MODEL_RESPONSE_SCHEMA,
  ModelDeadlineExceeded,
  type ModelCallOptions,
  type ModelImage,
} from '../../apps/recognizer/src/provider/types.js';
import type { ImageFetcher } from '../../apps/recognizer/src/provider/live.js';
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

const IMAGE: ModelImage = { scanId: '11111111-2222-3333-4444-555555555555', imageKey: 'photos/a.jpg' };
const CALL: ModelCallOptions = { model: 'haiku-4.5', deadlineMs: 30_000, signal: new AbortController().signal };

/**
 * Запрос порта собирается из тех же частей, что и в рабочем коде: кадр, схема из
 * ЕДИНСТВЕННОГО объявления и решения вызывающего. Схема передаётся ЯВНО — порт не берёт
 * её сам (ADR-001: страж читает одно место).
 */
function request(overrides: Partial<ModelImage & ModelCallOptions> = {}) {
  return { ...IMAGE, schema: MODEL_RESPONSE_SCHEMA, ...CALL, ...overrides };
}

const LIVE_CONFIG = {
  databaseUrl: 'x',
  storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
  quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
  modelProvider: 'live' as const,
};

/** Живой поставщик СОБИРАЕТСЯ, но в сеть не ходит: ключа на машине нет (DEC-A-009). */
const STUB_IMAGES: ImageFetcher = { fetchBase64: () => Promise.reject(new Error('живой вызов не выполняется в этой квитанции')) };

describe('поставщик модели', () => {
  it('фейковый адаптер детерминирован и не ходит в сеть', async () => {
    const provider = createFakeModelProvider();

    // Сеть перехвачена: любое обращение наружу провалит тест, а не останется незамеченным.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const first = await provider.recognize(request());
    const second = await provider.recognize(request());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(second).toEqual(first);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.items.length).toBeGreaterThan(0);
    // AC-scan-pipeline-29: фейк возвращает переданную модель эхом, а не выбирает сам.
    expect(first.model).toBe('haiku-4.5');

    // Разный вход — разный ответ: детерминизм не означает «всегда одно и то же».
    const other = await provider.recognize(request({ imageKey: 'photos/b.jpg' }));
    expect(other).not.toEqual(first);
  });

  it('модель выбирает вызывающий, и ответ сам называет, чей он', async () => {
    const provider = createFakeModelProvider();

    const primary = await provider.recognize(request({ model: 'haiku-4.5', deadlineMs: 30_000, signal: new AbortController().signal }));
    const escalated = await provider.recognize(request({ model: 'sonnet-5', deadlineMs: 30_000, signal: new AbortController().signal }));

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
      await expect(instant.recognize(request({ model: 'haiku-4.5', deadlineMs, signal: new AbortController().signal }))).rejects.toBeInstanceOf(
        ModelDeadlineExceeded,
      );
    }

    // Работа дольше бюджета — тоже отказ, а не поздний ответ: поздний ответ всё равно
    // оплачен и всё равно выбрасывается, и честнее сказать об этом сразу.
    const slow = createFakeModelProvider({ latencyMs: 60 });
    await expect(slow.recognize(request({ model: 'haiku-4.5', deadlineMs: 20, signal: new AbortController().signal }))).rejects.toBeInstanceOf(
      ModelDeadlineExceeded,
    );

    // Работа в пределах бюджета — обычный ответ.
    const fits = await slow.recognize(request({ model: 'haiku-4.5', deadlineMs: 5_000, signal: new AbortController().signal }));
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
        tooSlow.recognize(request({ model: 'haiku-4.5', deadlineMs: 5.9, signal: new AbortController().signal })),
      ).rejects.toBeInstanceOf(ModelDeadlineExceeded);
    }

  });

  it('бюджет, истёкший во время формирования ответа, даёт отказ, а не поздний успех', async () => {
    // Седьмое слепое ревью (RV-foundation-01): задержки нет вовсе, но SHA-256 и сборка
    // объекта сами тратят бюджет, и успех возвращался ПОСЛЕ дедлайна.
    //
    // Часы здесь ПОДМЕНЕНЫ, и это не украшение. Первая редакция этого теста ставила бюджет
    // 0,01 мс и требовала отказа двадцать раз подряд — то есть измеряла СКОРОСТЬ МАШИНЫ,
    // а не поведение кода: восьмое ревью прогнало тот же исходник пятью сериями и получило
    // 5, 17, 19, 19 и 17 УСПЕХОВ, каждый из которых уронил бы обязательный набор на
    // корректной реализации. Тест, способный покраснеть на верном коде, хуже отсутствующего:
    // он учит отключать себя. Поднятие порога лишь отодвинуло бы неустойчивость.
    //
    // `performance.now()` внутри фейка зовётся ровно трижды: на входе (абсолютный дедлайн),
    // после ожидания и перед возвратом. Значения заданы так, что бюджет ЦЕЛ на второй
    // проверке и ИСТЁК на третьей — ровно тот случай, который описало ревью.
    const clock = vi.spyOn(performance, 'now');
    try {
      clock.mockReturnValueOnce(0).mockReturnValueOnce(0.005).mockReturnValueOnce(1);
      await expect(
        createFakeModelProvider().recognize(request({ model: 'haiku-4.5', deadlineMs: 0.01, signal: new AbortController().signal })),
      ).rejects.toBeInstanceOf(ModelDeadlineExceeded);

      // Обратный сценарий той же тройкой: бюджет цел на обеих проверках — обычный ответ.
      // Без него тест доказывал бы только умение отказывать.
      clock.mockReturnValueOnce(0).mockReturnValueOnce(0.001).mockReturnValueOnce(0.002);
      const ok = await createFakeModelProvider().recognize(request({ model: 'haiku-4.5', deadlineMs: 0.01, signal: new AbortController().signal }));
      expect(ok.model).toBe('haiku-4.5');
    } finally {
      clock.mockRestore();
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
    const call = provider.recognize(request({
      model: 'haiku-4.5',
      deadlineMs: 20,
      // Сигнал НЕ срабатывает: порт обязан соблюдать переданный бюджет сам, а не ждать,
      // пока его оборвут снаружи.
      signal: new AbortController().signal,
    }));

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
      instant.recognize(request({ model: 'haiku-4.5', deadlineMs: 30_000, signal: aborted.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // Отмена ВО ВРЕМЯ работы обрывает её НЕМЕДЛЕННО, а не досиживает свой таймер: в этом и
    // смысл общего сигнала — платная работа прекращается в момент отмены.
    const slow = createFakeModelProvider({ latencyMs: 5_000 });
    const controller = new AbortController();
    const started = Date.now();
    const call = slow.recognize(request({ model: 'haiku-4.5', deadlineMs: 30_000, signal: controller.signal }));
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

  it('живой поставщик РЕАЛИЗОВАН этой фичей — конструируется, но не вызывается без сети (нет ключа на машине, DEC-A-009)', () => {
    const provider = selectModelProvider({ ...LIVE_CONFIG, anthropicApiKey: 'sk-test-value' }, STUB_IMAGES);
    expect(provider.kind).toBe('live');
  });

  it('выбор live БЕЗ ImageFetcher отказывает явно, а не откладывает отказ до первого задания', () => {
    // Прежняя редакция этого места (`foundation`) утверждала, что живой поставщик НЕ
    // реализован и бросает `LiveProviderNotImplemented`. Утверждение снято слиянием — не
    // ослаблением, а поставкой: фича `scan-pipeline` его реализовала, и заглушки больше
    // нет. Проверяемое свойство осталось тем же: отказ обязан прозвучать НА СБОРКЕ, а не
    // на первом задании.
    expect(() => selectModelProvider({ ...LIVE_CONFIG, anthropicApiKey: 'sk-test-value' })).toThrow(/ImageFetcher/);
  });

  it('режим fake выбирается только явным значением конфигурации', () => {
    const config = loadRecognizerConfig(BASE_ENV);
    expect(selectModelProvider(config).kind).toBe('fake');
  });
});
