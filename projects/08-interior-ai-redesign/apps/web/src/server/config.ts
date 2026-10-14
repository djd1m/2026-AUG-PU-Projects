import path from 'node:path';
import { z } from 'zod';
import {normalizePeer} from './peer';
export interface AiLiveConfig {
  apiKey: string; modelId: string; allowedModels: string[]; inputRateMicroUsdPerMillion: number; outputRateMicroUsdPerMillion: number;
  rateValidUntil: string; maxTokens: number; requestOverheadTokens: number; jobCapMicroUsd: number; accountDayCapMicroUsd: number; globalDayCapMicroUsd: number;
  providerHardLimitVerified: true; operatorEnabled: true;
  providerLimitReset?: 'daily' | 'weekly'; providerCapMicroUsd?: number;
}
export interface PaymentSku { sku: string; priceMinor: number; currency: 'RUB'; credits: number; unwatermarkedExport: boolean }
export interface RuntimeConfig {
  trustedProxyIP?: string; databaseUrl: string; publicOrigin: string; sessionSecret: string; assetDir: string;
  aiMode: 'manual' | 'demo' | 'live'; paymentsMode: 'off' | 'live'; aiLive?: AiLiveConfig;
  paymentLive?: { shopId: string; secret: string; testMode: boolean; skus: PaymentSku[] };
}
function invalid(): never { throw new Error('RUNTIME_CONFIG_INVALID'); }
function required(env: Record<string, string | undefined>, name: string): string { const value = env[name]; if (!value?.trim()) invalid(); return value.trim(); }
function positive(env: Record<string, string | undefined>, name: string, max = Number.MAX_SAFE_INTEGER): number {
  const raw = required(env, name); if (!/^[1-9][0-9]*$/.test(raw)) invalid();
  const value = Number(raw); if (!Number.isSafeInteger(value) || value > max) invalid(); return value;
}
export function loadConfig(env: Record<string, string | undefined> = process.env, now = new Date()): RuntimeConfig {
  const databaseUrl = required(env, 'DATABASE_URL');
  try { if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) invalid(); } catch { invalid(); }
  const publicOrigin = required(env, 'N8_PUBLIC_ORIGIN');
  try { const url = new URL(publicOrigin); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== publicOrigin || url.username || url.password) invalid(); } catch { invalid(); }
  const sessionSecret = required(env, 'N8_SESSION_SECRET'); if (Buffer.byteLength(sessionSecret) < 32) invalid();
  const assetDir = required(env, 'N8_ASSET_DIR'); if (!path.isAbsolute(assetDir)) invalid();
  const aiMode = env.N8_AI_MODE === undefined ? 'manual' : env.N8_AI_MODE;
  const paymentsMode = env.N8_PAYMENTS_MODE === undefined ? 'off' : env.N8_PAYMENTS_MODE;
  if (aiMode !== 'manual' && aiMode !== 'demo' && aiMode !== 'live') invalid();
  if (paymentsMode !== 'off' && paymentsMode !== 'live') invalid();
  const config: RuntimeConfig = { databaseUrl, publicOrigin, sessionSecret, assetDir, aiMode, paymentsMode };
  if (env.N8_TRUSTED_PROXY_IP !== undefined && env.N8_TRUSTED_PROXY_IP !== '') {
    if (!publicOrigin.startsWith('https://') || env.N8_TRUSTED_PROXY_IP !== env.N8_TRUSTED_PROXY_IP.trim()) invalid();
    try { config.trustedProxyIP = normalizePeer(env.N8_TRUSTED_PROXY_IP); } catch { invalid(); }
  }
  if (aiMode === 'live') {
    const modelId = required(env, 'N8_AI_MODEL_ID'); const allowedModels = required(env, 'N8_AI_ALLOWED_MODELS').split(',');
    if (!/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/.test(modelId) || !allowedModels.includes(modelId) || allowedModels.some(x => !x || x !== x.trim())) invalid();
    const jobCapMicroUsd = positive(env, 'N8_AI_JOB_CAP_MICRO_USD');
    const accountDayCapMicroUsd = positive(env, 'N8_AI_ACCOUNT_DAY_CAP_MICRO_USD');
    const globalDayCapMicroUsd = positive(env, 'N8_AI_GLOBAL_DAY_CAP_MICRO_USD');
    if (jobCapMicroUsd > accountDayCapMicroUsd || accountDayCapMicroUsd > globalDayCapMicroUsd) invalid();
    const rateValidUntil = required(env, 'N8_AI_RATE_VALID_UNTIL');
    if (!Number.isFinite(Date.parse(rateValidUntil)) || Date.parse(rateValidUntil) <= now.getTime()) invalid();
    if (env.N8_AI_PROVIDER_HARD_LIMIT_VERIFIED !== 'true' || env.N8_AI_OPERATOR_ENABLED !== 'true') invalid();
    let providerLimits: {providerLimitReset:'daily'|'weekly';providerCapMicroUsd:number}|undefined;
    if(env.N8_AI_PROVIDER_LIMIT_RESET!==undefined||env.N8_AI_PROVIDER_CAP_MICRO_USD!==undefined){
      const reset=env.N8_AI_PROVIDER_LIMIT_RESET;
      if(reset!=='daily'&&reset!=='weekly')invalid();
      const cap=positive(env,'N8_AI_PROVIDER_CAP_MICRO_USD');
      if(cap<jobCapMicroUsd||(reset==='daily'&&cap>globalDayCapMicroUsd))invalid();
      providerLimits={providerLimitReset:reset,providerCapMicroUsd:cap};
    }
    config.aiLive = { ...providerLimits, apiKey: required(env, 'N8_OPENROUTER_API_KEY'), modelId, allowedModels,
      inputRateMicroUsdPerMillion: positive(env, 'N8_AI_RATE_INPUT_MICRO_USD_PER_MILLION'), outputRateMicroUsdPerMillion: positive(env, 'N8_AI_RATE_OUTPUT_MICRO_USD_PER_MILLION'),
      maxTokens: positive(env, 'N8_AI_MAX_TOKENS', 4096), requestOverheadTokens: positive(env, 'N8_AI_REQUEST_OVERHEAD_TOKENS', 100000), rateValidUntil, jobCapMicroUsd, accountDayCapMicroUsd, globalDayCapMicroUsd,
      providerHardLimitVerified: true, operatorEnabled: true };
  }
  if (paymentsMode === 'live') {
    if (!publicOrigin.startsWith('https://') || !['true', 'false'].includes(env.N8_PAYMENT_TEST_MODE ?? '')) invalid();
    const skuSchema = z.array(z.object({ sku: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), priceMinor: z.number().int().positive().max(1e12), currency: z.literal('RUB'),
      credits: z.number().int().positive().max(1e6), unwatermarkedExport: z.boolean() }).strict()).min(1).max(20);
    let raw: unknown; try { raw = JSON.parse(required(env, 'N8_PAYMENT_SKUS_JSON')); } catch { invalid(); }
    const parsed = skuSchema.safeParse(raw); if (!parsed.success || new Set(parsed.data.map(x => x.sku)).size !== parsed.data.length) invalid();
    config.paymentLive = { shopId: required(env, 'N8_PAYMENT_SHOP_ID'), secret: required(env, 'N8_PAYMENT_SECRET'), testMode: env.N8_PAYMENT_TEST_MODE === 'true', skus: parsed.data };
  }
  return config;
}
