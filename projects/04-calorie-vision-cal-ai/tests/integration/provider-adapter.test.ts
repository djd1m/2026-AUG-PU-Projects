// Адаптер поставщика модели (AC-foundation-11).

import { describe, expect, it, vi } from 'vitest';
import { ConfigValidationError } from '@n4/shared';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { selectModelProvider } from '../../apps/recognizer/src/provider/select.js';
import { LiveProviderNotImplemented } from '../../apps/recognizer/src/provider/live.js';
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

describe('поставщик модели', () => {
  it('фейковый адаптер детерминирован и не ходит в сеть', async () => {
    const provider = createFakeModelProvider();
    const request = { scanId: '11111111-2222-3333-4444-555555555555', imageKey: 'photos/a.jpg', model: 'haiku-4.5' } as const;

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

  it('живой поставщик в этой фиче не реализован и говорит об этом явно', async () => {
    const provider = selectModelProvider({
      databaseUrl: 'x',
      storage: { endpoint: 'x', bucket: 'x', accessKey: 'x', secretKey: 'x' },
      quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
      modelProvider: 'live',
      anthropicApiKey: 'sk-test-value',
    });
    expect(provider.kind).toBe('live');
    // Тихо вернуть пустой ответ нельзя: он неотличим от разбора пустой тарелки.
    await expect(provider.recognize({ scanId: 'a', imageKey: 'b', model: 'haiku-4.5' })).rejects.toBeInstanceOf(LiveProviderNotImplemented);
  });

  it('режим fake выбирается только явным значением конфигурации', () => {
    const config = loadRecognizerConfig(BASE_ENV);
    expect(selectModelProvider(config).kind).toBe('fake');
  });
});
