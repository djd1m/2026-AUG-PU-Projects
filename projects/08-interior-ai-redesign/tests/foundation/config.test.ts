import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../apps/web/src/server/config';
const required = { DATABASE_URL: 'postgresql://user:secret@localhost/db', N8_PUBLIC_ORIGIN: 'http://127.0.0.1:3088', N8_SESSION_SECRET: 's'.repeat(32), N8_ASSET_DIR: '/tmp/n8-assets' };
const ai = { N8_AI_MODE: 'live', N8_OPENROUTER_API_KEY: 'test-only-key', N8_AI_MODEL_ID: 'vendor/model', N8_AI_ALLOWED_MODELS: 'vendor/model',
  N8_AI_RATE_INPUT_MICRO_USD_PER_MILLION: '1000', N8_AI_RATE_OUTPUT_MICRO_USD_PER_MILLION: '2000', N8_AI_RATE_VALID_UNTIL: '2026-10-14T00:00:00Z', N8_AI_MAX_TOKENS: '4096', N8_AI_REQUEST_OVERHEAD_TOKENS: '256',
  N8_AI_JOB_CAP_MICRO_USD: '100', N8_AI_ACCOUNT_DAY_CAP_MICRO_USD: '500', N8_AI_GLOBAL_DAY_CAP_MICRO_USD: '2000', N8_AI_PROVIDER_HARD_LIMIT_VERIFIED: 'true', N8_AI_OPERATOR_ENABLED: 'true' };
const now = new Date('2026-10-13T00:00:00Z');
describe('SC-US-017-2 runtime fail closed without provider calls', () => {
  it('defaults apply only absent; rejects blank/unknown modes and missing base config', () => {
    expect(loadConfig(required, now)).toMatchObject({ aiMode: 'manual', paymentsMode: 'off' });
    for (const key of Object.keys(required)) expect(() => loadConfig({ ...required, [key]: '' }, now)).toThrow('RUNTIME_CONFIG_INVALID');
    for (const value of ['', 'fake', 'enabled', ' live ']) {
      expect(() => loadConfig({ ...required, N8_AI_MODE: value }, now)).toThrow(); expect(() => loadConfig({ ...required, N8_PAYMENTS_MODE: value }, now)).toThrow();
    }
    expect(() => loadConfig({ ...required, N8_PUBLIC_ORIGIN: 'https://user:secret@example.org' }, now)).toThrow();
  });
  it('all live key/cap/rate/model/output/guardrail fields mandatory; ordered integer caps; no egress', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(loadConfig({ ...required, ...ai }, now).aiLive?.maxTokens).toBe(4096);
    for (const key of Object.keys(ai).filter(x => x !== 'N8_AI_MODE')) expect(() => loadConfig({ ...required, ...ai, [key]: '' }, now)).toThrow();
    for (const change of [{ N8_AI_JOB_CAP_MICRO_USD: '501' }, { N8_AI_GLOBAL_DAY_CAP_MICRO_USD: '400' }, { N8_AI_MAX_TOKENS: '4097' },
      { N8_AI_MAX_TOKENS: '1.5' }, { N8_AI_RATE_VALID_UNTIL: '2026-10-12' }, { N8_AI_MODEL_ID: 'other/model' }, { N8_AI_OPERATOR_ENABLED: 'false' }]) expect(() => loadConfig({ ...required, ...ai, ...change }, now)).toThrow();
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it('payment live requires HTTPS/merchant/testflag/server SKU; fake never runtime mode', () => {
    const live = { ...required, N8_PUBLIC_ORIGIN: 'https://n8.test', N8_PAYMENTS_MODE: 'live', N8_PAYMENT_SHOP_ID: 'shop', N8_PAYMENT_SECRET: 'secret', N8_PAYMENT_TEST_MODE: 'true',
      N8_PAYMENT_SKUS_JSON: JSON.stringify([{ sku: 'small', priceMinor: 10000, currency: 'RUB', credits: 10, unwatermarkedExport: true }]) };
    expect(loadConfig(live, now).paymentLive?.skus[0].credits).toBe(10);
    for (const key of ['N8_PAYMENT_SHOP_ID', 'N8_PAYMENT_SECRET', 'N8_PAYMENT_TEST_MODE', 'N8_PAYMENT_SKUS_JSON']) expect(() => loadConfig({ ...live, [key]: '' }, now)).toThrow();
    expect(() => loadConfig({ ...live, N8_PUBLIC_ORIGIN: required.N8_PUBLIC_ORIGIN }, now)).toThrow();
    expect(() => loadConfig({ ...live, N8_PAYMENT_SKUS_JSON: '[{"priceMinor":1}]' }, now)).toThrow();
  });
  it('explicit weekly provider ceiling is independent of daily application caps; malformed pairs fail closed', () => {
    const base={...required,...ai,N8_AI_GLOBAL_DAY_CAP_MICRO_USD:'5000000'};
    expect(loadConfig(base,now).aiLive?.providerLimitReset).toBeUndefined();
    expect(loadConfig({...base,N8_AI_PROVIDER_LIMIT_RESET:'weekly',N8_AI_PROVIDER_CAP_MICRO_USD:'10000000'},now).aiLive).toMatchObject({providerLimitReset:'weekly',providerCapMicroUsd:10000000,globalDayCapMicroUsd:5000000});
    expect(loadConfig({...base,N8_AI_PROVIDER_LIMIT_RESET:'daily',N8_AI_PROVIDER_CAP_MICRO_USD:'5000000'},now).aiLive?.providerLimitReset).toBe('daily');
    for(const change of [{N8_AI_PROVIDER_LIMIT_RESET:'weekly'},{N8_AI_PROVIDER_CAP_MICRO_USD:'10000000'},
      {N8_AI_PROVIDER_LIMIT_RESET:'',N8_AI_PROVIDER_CAP_MICRO_USD:''},
      {N8_AI_PROVIDER_LIMIT_RESET:'monthly',N8_AI_PROVIDER_CAP_MICRO_USD:'10000000'},
      ...['','0','-1','1.5','99','9007199254740992'].map(N8_AI_PROVIDER_CAP_MICRO_USD=>({N8_AI_PROVIDER_LIMIT_RESET:'weekly',N8_AI_PROVIDER_CAP_MICRO_USD})),
      {N8_AI_PROVIDER_LIMIT_RESET:'daily',N8_AI_PROVIDER_CAP_MICRO_USD:'10000000'}])expect(()=>loadConfig({...base,...change},now)).toThrow('RUNTIME_CONFIG_INVALID');
  });
});

it('server-only budget account setting is opt-in and validates exact UUID',()=>{const id='00000000-0000-4000-8000-000000000001';expect(loadConfig({...required,...ai,N8_AI_BUDGET_ONLY_ACCOUNT_ID:id},now).aiLive?.budgetOnlyAccountId).toBe(id);expect(loadConfig({...required,...ai,N8_AI_BUDGET_ONLY_ACCOUNT_ID:''},now).aiLive?.budgetOnlyAccountId).toBeUndefined();for(const value of ['*','all','wrong',id+' '])expect(()=>loadConfig({...required,...ai,N8_AI_BUDGET_ONLY_ACCOUNT_ID:value},now)).toThrow();});
