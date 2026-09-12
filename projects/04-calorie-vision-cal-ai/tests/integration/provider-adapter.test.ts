// Адаптер поставщика модели (AC-foundation-11 → расширен фичей `scan-pipeline`,
// FR-scan-pipeline-13: `LiveModelProvider` теперь РЕАЛИЗОВАН — эта фича вводит вызовы
// наружу, которых `foundation` сознательно не делала (DEC-A-009)).

import { describe, expect, it, vi } from 'vitest';
import { ConfigValidationError } from '@n4/shared';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { selectModelProvider } from '../../apps/recognizer/src/provider/select.js';
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

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  return controller.signal;
}

describe('поставщик модели', () => {
  it('фейковый адаптер детерминирован и не ходит в сеть', async () => {
    const provider = createFakeModelProvider();
    const request = {
      scanId: '11111111-2222-3333-4444-555555555555',
      imageKey: 'photos/a.jpg',
      model: 'haiku-4.5' as const,
      deadlineMs: 25_000,
      signal: abortedSignal(),
    };

    // Сеть перехвачена: любое обращение наружу провалит тест, а не останется незамеченным.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const first = await provider.recognize(request);
    const second = await provider.recognize(request);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(second).toEqual(first);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.items.length).toBeGreaterThan(0);
    // AC-scan-pipeline-29: фейк возвращает переданную модель эхом, а не выбирает сам.
    expect(first.model).toBe('haiku-4.5');

    // Разный вход — разный ответ: детерминизм не означает «всегда одно и то же».
    const other = await provider.recognize({ ...request, imageKey: 'photos/b.jpg' });
    expect(other).not.toEqual(first);
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
    expect(() =>
      selectModelProvider({
        databaseUrl: 'x',
        storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
        quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
        modelProvider: 'live',
        anthropicApiKey: undefined,
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('живой поставщик РЕАЛИЗОВАН этой фичей — конструируется, но не вызывается без сети (нет ключа на машине, DEC-A-009)', () => {
    const stubImages: ImageFetcher = { fetchBase64: () => Promise.reject(new Error('живой вызов не выполняется в этой квитанции')) };
    const provider = selectModelProvider(
      {
        databaseUrl: 'x',
        storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
        quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
        modelProvider: 'live',
        anthropicApiKey: 'sk-test-value',
      },
      stubImages,
    );
    expect(provider.kind).toBe('live');
  });

  it('выбор live БЕЗ ImageFetcher отказывает явно, а не откладывает отказ до первого задания', () => {
    expect(() =>
      selectModelProvider({
        databaseUrl: 'x',
        storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
        quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
        modelProvider: 'live',
        anthropicApiKey: 'sk-test-value',
      }),
    ).toThrow(/ImageFetcher/);
  });

  it('режим fake выбирается только явным значением конфигурации', () => {
    const config = loadRecognizerConfig(BASE_ENV);
    expect(selectModelProvider(config).kind).toBe('fake');
  });
});
