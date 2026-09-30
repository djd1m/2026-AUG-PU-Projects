import { describe, expect, it } from 'vitest';
import { checkConfig, ConfigError, isVerifiedConfig, LIMIT_VARIABLES, type Pool, type VarSpec } from '@n6b/db';
import { createLiveGateway } from '../../src/live';

// spend-ceilings 08_review.md R-1: фабрика живой двери берёт пределы только из проверенной конфигурации. Проба валидатора
// P3 (вторая дверь с пределами 2^31−1) обязана отказывать ДО создания двери, а не связывать «выдуманный» потолок.

const SPECS: VarSpec[] = [
  { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'вызовы модели невозможны' },
  ...Object.values(LIMIT_VARIABLES).map((name): VarSpec => ({ name, kind: 'limit', consequence: 'потолок не определён' })),
];
const ENV: Record<string, string> = { OPENROUTER_API_KEY: 'k'.repeat(40), LIMIT_ANSWER_VISITOR_DAY: '30',
  LIMIT_ANSWER_BOT_DAY: '300', LIMIT_ANSWER_GLOBAL_DAY: '3000', LIMIT_SANDBOX_ACCOUNT_DAY: '100',
  LIMIT_SANDBOX_GLOBAL_DAY: '2000', LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '2000000', LIMIT_EMBED_TOKENS_GLOBAL_DAY: '20000000' };
const pool = {} as Pool; // дверь при создании в БД не ходит

describe('R-1: живая дверь — пределы только из checkConfig', () => {
  it('проверенная конфигурация принимается, и она заморожена', () => {
    const config = checkConfig(SPECS, [], ENV, true);
    expect(isVerifiedConfig(config)).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => createLiveGateway({ config, pool })).not.toThrow();
  });

  it('литерал, копия через spread и подменённые пределы — отказ ConfigError до создания двери', () => {
    const verified = checkConfig(SPECS, [], ENV, true);
    const invented = Object.fromEntries(Object.values(LIMIT_VARIABLES).map((n) => [n, 2_147_483_647]));
    for (const bad of [{ ...invented, OPENROUTER_API_KEY: 'k'.repeat(40) }, { ...verified },
      { ...verified, LIMIT_SANDBOX_GLOBAL_DAY: 2_147_483_647 }, Object.freeze({ ...verified })]) {
      expect(isVerifiedConfig(bad)).toBe(false);
      expect(() => createLiveGateway({ config: bad, pool })).toThrow(ConfigError);
    }
  });

  it('поле limits рядом с конфигурацией не принимается', () => {
    const config = checkConfig(SPECS, [], ENV, true);
    const options = { config, pool, limits: { answerGlobalDay: 2_147_483_647 } };
    expect(() => createLiveGateway(options)).toThrow(/поле limits не принимается/);
  });

  it('проверенная конфигурация неизменяема: подменить число в ней нельзя', () => {
    const config = checkConfig(SPECS, [], ENV, true) as Record<string, string | number>;
    expect(() => { config.LIMIT_ANSWER_GLOBAL_DAY = 2_147_483_647; }).toThrow(TypeError);
  });
});
