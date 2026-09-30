// Boot config check процесса worker: его подмножество переменных (compose: x-model-env + DATABASE_URL).
// Решения, читающие пределы эмбеддингов, реализует фича chunk-embed/spend-ceilings.

import { checkConfig, type ConfigValues, type PairRule, type VarSpec } from '@n6b/db';

export const WORKER_REQUIRED: readonly VarSpec[] = [
  { name: 'DATABASE_URL', kind: 'secret', consequence: 'воркер не может брать задачи из БД' },
  { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'эмбеддинги индексации невозможны' },
  { name: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', kind: 'limit', consequence: 'индексация аккаунта без предела токенов' },
  { name: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY', kind: 'limit', consequence: 'индексация без общего потолка токенов' },
];

export const WORKER_PAIRS: readonly PairRule[] = [
  { personal: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', total: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY' },
];

export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>> = process.env): ConfigValues {
  return checkConfig(WORKER_REQUIRED, WORKER_PAIRS, env, env.NODE_ENV === 'production');
}
