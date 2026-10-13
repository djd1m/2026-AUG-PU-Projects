import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';

// Живая дверь (spend-ceilings R-1, index-jobs 08_review.md F-2 — по устройству, а не стражем): фабрика без параметров
// пределов и ключа сама один раз читает process.env через checkConfig и кэширует исход; конфигурацию извне не принимает;
// PaidGateway снаружи пакета не конструируется. Компиляционная половина — live-factory.types.ts (typecheck).
// Каждый тест берёт свежий модуль (vi.resetModules): кэш фабрики живёт в модуле, как в процессе.

const ENV: Record<string, string> = { OPENROUTER_API_KEY: 'k'.repeat(40), LIMIT_ANSWER_VISITOR_DAY: '30',
  LIMIT_ANSWER_BOT_DAY: '300', LIMIT_ANSWER_GLOBAL_DAY: '3000', LIMIT_SANDBOX_ACCOUNT_DAY: '100',
  LIMIT_SANDBOX_GLOBAL_DAY: '2000', LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '2000000', LIMIT_EMBED_TOKENS_GLOBAL_DAY: '20000000',
  VISITOR_SECRET: 'v'.repeat(48) };
const pool = {} as Pool; // дверь при создании в БД не ходит
const saved = { ...process.env };

async function fresh() {
  vi.resetModules();
  const live = await import('../../src/live');
  const db = await import('@n6b/db');
  return { ...live, ConfigError: db.ConfigError };
}

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) process.env[k] = v; });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('F-2: живая дверь читает окружение процесса сама и один раз', () => {
  it('проверенное окружение → дверь создаётся без единого параметра пределов', async () => {
    const { createLiveGateway } = await fresh();
    expect(() => createLiveGateway({ pool })).not.toThrow();
  });

  it('нет предела или предел пустой/выше int4/персональный > общего → ConfigError с именем переменной', async () => {
    const cases: Array<[string, string | undefined, RegExp]> = [
      ['LIMIT_SANDBOX_GLOBAL_DAY', undefined, /LIMIT_SANDBOX_GLOBAL_DAY не задан/],
      ['LIMIT_ANSWER_GLOBAL_DAY', '', /LIMIT_ANSWER_GLOBAL_DAY задан пустым/],
      ['LIMIT_ANSWER_GLOBAL_DAY', '3000000000', /LIMIT_ANSWER_GLOBAL_DAY больше/],
      ['LIMIT_SANDBOX_ACCOUNT_DAY', '5000', /LIMIT_SANDBOX_ACCOUNT_DAY/],
      ['OPENROUTER_API_KEY', undefined, /OPENROUTER_API_KEY не задан/],
      ['VISITOR_SECRET', 'short', /VISITOR_SECRET короче/],
    ];
    for (const [name, value, message] of cases) {
      for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
      const { createLiveGateway, ConfigError } = await fresh();
      expect(() => createLiveGateway({ pool }), name).toThrow(ConfigError);
      expect(() => createLiveGateway({ pool }), name).toThrow(message);
    }
  });

  it('исход кэшируется: правка process.env после первого создания двери её не меняет (и отказ тоже кэшируется)', async () => {
    const ok = await fresh();
    ok.createLiveGateway({ pool });
    process.env.LIMIT_ANSWER_GLOBAL_DAY = '';
    expect(() => ok.createLiveGateway({ pool })).not.toThrow(); // окружение не перечитано
    const bad = await fresh();
    expect(() => bad.createLiveGateway({ pool })).toThrow(/LIMIT_ANSWER_GLOBAL_DAY/);
    process.env.LIMIT_ANSWER_GLOBAL_DAY = '3000';
    expect(() => bad.createLiveGateway({ pool })).toThrow(/LIMIT_ANSWER_GLOBAL_DAY/); // «починка» задним числом не принята
  });
});

describe('F-2: свои пределы или ключ передать нельзя, дверь снаружи не конструируется', () => {
  it('поле config, limits или ключ в опциях → ConfigError до чтения окружения', async () => {
    const { createLiveGateway, ConfigError } = await fresh();
    const invented = { LIMIT_ANSWER_GLOBAL_DAY: 2_147_483_647 };
    for (const extra of [{ config: invented }, { limits: { answerGlobalDay: 2_147_483_647 } }, { apiKey: 'x' },
      { provider: {} }]) {
      const options = { pool, ...extra } as unknown as Parameters<typeof createLiveGateway>[0];
      expect(() => createLiveGateway(options), Object.keys(extra)[0]).toThrow(ConfigError);
      expect(() => createLiveGateway(options)).toThrow(/извне не принимается/);
    }
  });

  it('конструктор двери без ключа модуля отвергает: new через constructor, Reflect.construct, подделанный ключ', async () => {
    const { createLiveGateway } = await fresh();
    const gw = createLiveGateway({ pool });
    const Ctor = gw.constructor as new (...args: unknown[]) => unknown;
    const limits = { answerVisitorDay: 1, answerBotDay: 1, answerGlobalDay: 2_147_483_647, sandboxAccountDay: 1,
      sandboxGlobalDay: 1, embedTokensAccountDay: 1, embedTokensGlobalDay: 1 };
    const deps = { pool, provider: {}, limits };
    for (const attempt of [() => new Ctor(deps), () => new Ctor(Symbol('PaidGateway: создаётся только внутри пакета rag'), deps),
      () => Reflect.construct(Ctor, [undefined, deps])]) {
      expect(attempt).toThrow(/не создаётся снаружи пакета rag/);
    }
  });

  it('вход пакета не отдаёт ни класс двери значением, ни внутреннюю сборку', async () => {
    vi.resetModules();
    const entry = await import('../../src/index') as Record<string, unknown>;
    expect(entry.PaidGateway).toBeUndefined();
    expect(entry.constructGateway).toBeUndefined();
    expect(typeof entry.createLiveGateway).toBe('function');
  });
});
