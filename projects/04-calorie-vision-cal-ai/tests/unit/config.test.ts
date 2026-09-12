// Конфигурация fail-closed (AC-foundation-2, AC-foundation-3, AC-foundation-11).
//
// Проверка ОДНОЙ переменной зеленеет при отсутствующей второй, поэтому каждая обязательная
// переменная проверяется ОТДЕЛЬНЫМ прогоном: три потолка, два порога частоты, адрес,
// строка подключения и ЧЕТЫРЕ переменные S3 (пробел VF-01 отчёта валидации — раньше
// S3-переменные не были названы ни одним критерием и ни одним тестом).

import { describe, expect, it } from 'vitest';
import { ConfigValidationError } from '@n4/shared';
import { loadApiConfig } from '../../apps/api/src/env.js';
import { loadRecognizerConfig } from '../../apps/recognizer/src/env.js';

const FULL_API_ENV: Record<string, string | undefined> = {
  DATABASE_URL: 'postgresql://n4_app:secret@db:5432/n4',
  APP_ORIGIN: 'https://tarelka.example',
  S3_ENDPOINT: 'http://storage:9000',
  S3_BUCKET: 'n4-photos',
  S3_ACCESS_KEY: 'access-key-value',
  S3_SECRET_KEY: 'secret-key-value',
  N4_SCAN_LIMIT_USER: '10',
  N4_SCAN_LIMIT_DAY: '3000',
  N4_ESCALATION_LIMIT_DAY: '600',
  N4_RATE_LIMIT_MUTATE_PER_MIN: '30',
  N4_RATE_LIMIT_READ_PER_MIN: '120',
};

const FULL_RECOGNIZER_ENV: Record<string, string | undefined> = {
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

function withoutVariable(base: Record<string, string | undefined>, name: string): Record<string, string | undefined> {
  const copy = { ...base };
  delete copy[name];
  return copy;
}

function refusalFor(load: () => unknown): ConfigValidationError {
  try {
    load();
  } catch (error) {
    if (error instanceof ConfigValidationError) return error;
    throw error;
  }
  throw new Error('конфигурация принята там, где обязана была отказать');
}

describe('валидатор конфигурации api', () => {
  it('полное окружение принимается и числа берутся из него, а не из литералов', () => {
    const config = loadApiConfig(FULL_API_ENV);
    expect(config.quota).toEqual({ scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 });
    expect(config.rateLimits).toEqual({ mutatePerMinute: 30, readPerMinute: 120 });
    expect(config.appOrigin).toBe('https://tarelka.example');
  });

  it('отсутствие N4_SCAN_LIMIT_USER валит старт с названной переменной', () => {
    const error = refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, 'N4_SCAN_LIMIT_USER')));
    expect(error.variables).toEqual(['N4_SCAN_LIMIT_USER']);
    expect(error.message).toContain('N4_SCAN_LIMIT_USER');
    expect(error.message).toContain('вызовы');
  });

  it('отсутствие N4_SCAN_LIMIT_DAY валит старт с названной переменной', () => {
    const error = refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, 'N4_SCAN_LIMIT_DAY')));
    expect(error.variables).toEqual(['N4_SCAN_LIMIT_DAY']);
  });

  it('отсутствие N4_ESCALATION_LIMIT_DAY валит старт с названной переменной', () => {
    const error = refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, 'N4_ESCALATION_LIMIT_DAY')));
    expect(error.variables).toEqual(['N4_ESCALATION_LIMIT_DAY']);
  });

  it('пустая строка и нечисловое значение потолка отвергаются наравне с отсутствием', () => {
    for (const bad of ['', '   ', '0', '-1', 'abc', '1.5', '1e3']) {
      const error = refusalFor(() => loadApiConfig({ ...FULL_API_ENV, N4_SCAN_LIMIT_USER: bad }));
      expect(error.variables, JSON.stringify(bad)).toEqual(['N4_SCAN_LIMIT_USER']);
    }
  });

  it('отсутствие APP_ORIGIN валит старт и не подставляет localhost', () => {
    const error = refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, 'APP_ORIGIN')));
    expect(error.variables).toEqual(['APP_ORIGIN']);
    // Сообщение НАЗЫВАЕТ последствие, а не только факт: «переменная не задана» без
    // объяснения цены читается как придирка, и защиту снимают.
    expect(error.message).toContain('ссылку');
    // Непригодное значение отвергается, а НЕ подчищается: срезание хвостового слеша
    // однажды дало пустую строку и уронило каждый new URL(path, base).
    for (const bad of ['/', 'не-url', 'ftp://tarelka.example', 'https://tarelka.example/app']) {
      expect(refusalFor(() => loadApiConfig({ ...FULL_API_ENV, APP_ORIGIN: bad })).variables, bad).toEqual(['APP_ORIGIN']);
    }
  });

  it('отсутствие DATABASE_URL валит старт с названной переменной', () => {
    expect(refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, 'DATABASE_URL'))).variables).toEqual(['DATABASE_URL']);
  });

  it('отсутствие любой из четырёх переменных S3 валит старт с названной переменной', () => {
    for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      const missing = refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, name)));
      expect(missing.variables, name).toEqual([name]);
      const empty = refusalFor(() => loadApiConfig({ ...FULL_API_ENV, [name]: '' }));
      expect(empty.variables, `${name}=''`).toEqual([name]);
    }
  });

  it('отсутствие любого из двух порогов частоты валит старт с названной переменной', () => {
    for (const name of ['N4_RATE_LIMIT_MUTATE_PER_MIN', 'N4_RATE_LIMIT_READ_PER_MIN']) {
      expect(refusalFor(() => loadApiConfig(withoutVariable(FULL_API_ENV, name))).variables, name).toEqual([name]);
    }
  });

  it('отказ называет ВСЕ незакрытые переменные сразу, а не первую', () => {
    const error = refusalFor(() => loadApiConfig({ ...FULL_API_ENV, N4_SCAN_LIMIT_USER: '', APP_ORIGIN: '' }));
    expect(error.variables.sort()).toEqual(['APP_ORIGIN', 'N4_SCAN_LIMIT_USER']);
  });
});

describe('валидатор конфигурации recognizer', () => {
  it('режим fake без ключа законен: фейк денег не тратит и наружу не ходит', () => {
    const config = loadRecognizerConfig(FULL_RECOGNIZER_ENV);
    expect(config.modelProvider).toBe('fake');
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it('значение N4_MODEL_PROVIDER вне множества fake live отвергается', () => {
    // Пробелы по краям срезаются НАМЕРЕННО (`FOO=fake ` в .env — не опечатка выбора,
    // а невидимый символ), поэтому в списке мусора их нет: он о РАСПОЗНАВАНИИ значения.
    for (const bad of ['Fake', 'LIVE', 'дичь', '', 'null', 'fake|live']) {
      const error = refusalFor(() => loadRecognizerConfig({ ...FULL_RECOGNIZER_ENV, N4_MODEL_PROVIDER: bad }));
      expect(error.variables, JSON.stringify(bad)).toContain('N4_MODEL_PROVIDER');
    }
    // Отсутствие переменной — тоже отказ, а не «возьмём fake».
    expect(refusalFor(() => loadRecognizerConfig(withoutVariable(FULL_RECOGNIZER_ENV, 'N4_MODEL_PROVIDER'))).variables).toContain('N4_MODEL_PROVIDER');
  });

  it('режим live без ключа валит старт с названной переменной', () => {
    const error = refusalFor(() => loadRecognizerConfig({ ...FULL_RECOGNIZER_ENV, N4_MODEL_PROVIDER: 'live' }));
    expect(error.variables).toContain('ANTHROPIC_API_KEY');
    const missingKey = refusalFor(() =>
      loadRecognizerConfig({ ...withoutVariable(FULL_RECOGNIZER_ENV, 'ANTHROPIC_API_KEY'), N4_MODEL_PROVIDER: 'live' }),
    );
    expect(missingKey.variables).toContain('ANTHROPIC_API_KEY');
  });

  it('режим live с ключом принимается', () => {
    const config = loadRecognizerConfig({ ...FULL_RECOGNIZER_ENV, N4_MODEL_PROVIDER: 'live', ANTHROPIC_API_KEY: 'sk-test-value' });
    expect(config.modelProvider).toBe('live');
    expect(config.anthropicApiKey).toBe('sk-test-value');
  });

  it('отсутствие любой из четырёх переменных S3 валит старт воркера', () => {
    for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      expect(refusalFor(() => loadRecognizerConfig(withoutVariable(FULL_RECOGNIZER_ENV, name))).variables, name).toEqual([name]);
    }
  });
});

describe('пороги ограничения частоты соответствуют канону', () => {
  // Литералы канона §7 (DEC-A-013). Тест их НЕ вычисляет из конфигурации: он сверяет
  // поставляемый `.env.example` с числом, записанным в каноне. Порог, взятый из того же
  // файла, который проверяется, не проверяет ничего.
  it('в поставляемом окружении заданы 30 мутаций и 120 чтений в минуту', async () => {
    const { readFile } = await import('node:fs/promises');
    const example = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
    expect(example).toMatch(/^N4_RATE_LIMIT_MUTATE_PER_MIN=30$/m);
    expect(example).toMatch(/^N4_RATE_LIMIT_READ_PER_MIN=120$/m);
    expect(example).toMatch(/^N4_SCAN_LIMIT_USER=10$/m);
    expect(example).toMatch(/^N4_SCAN_LIMIT_DAY=3000$/m);
    expect(example).toMatch(/^N4_ESCALATION_LIMIT_DAY=600$/m);
  });
});
