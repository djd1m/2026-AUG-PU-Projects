// Boot config check процесса worker (compose: x-model-env + x-door-limits + DATABASE_URL_SERVICE).
// chunk-embed: воркер держит платную дверь (paid.ts → createLiveGateway), а фабрика требует ПОЛНУЮ связку — ключ и все
// семь LIMIT_* (limitsFrom). Поэтому пределы ответа тоже обязательны здесь: без них процесс не стартует с именем
// переменной, а не падает на первой задаче. Решение по LIMIT_EMBED_TOKENS_* принимает дверь (embedIndexBatch → embedKeys);
// пределы ответа воркер не расходует — они только собирают дверь (CFG-I5: читаются limitsFrom при её создании).

import { checkConfig, type ConfigValues, type PairRule, type VarSpec } from '@n6b/db';

export const WORKER_REQUIRED: readonly VarSpec[] = [
  { name: 'DATABASE_URL_SERVICE', kind: 'pg-url', user: 'n6b_app_service', consequence: 'воркер не может брать задачи из БД' },
  { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'эмбеддинги индексации невозможны' },
  { name: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', kind: 'limit', consequence: 'индексация аккаунта без предела токенов' },
  { name: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY', kind: 'limit', consequence: 'индексация без общего потолка токенов' },
  { name: 'LIMIT_ANSWER_VISITOR_DAY', kind: 'limit', consequence: 'платная дверь воркера не собирается без полной связки пределов' },
  { name: 'LIMIT_ANSWER_BOT_DAY', kind: 'limit', consequence: 'платная дверь воркера не собирается без полной связки пределов' },
  { name: 'LIMIT_ANSWER_GLOBAL_DAY', kind: 'limit', consequence: 'платная дверь воркера не собирается без полной связки пределов' },
  { name: 'LIMIT_SANDBOX_ACCOUNT_DAY', kind: 'limit', consequence: 'платная дверь воркера не собирается без полной связки пределов' },
  { name: 'LIMIT_SANDBOX_GLOBAL_DAY', kind: 'limit', consequence: 'платная дверь воркера не собирается без полной связки пределов' },
];

export const WORKER_PAIRS: readonly PairRule[] = [
  { personal: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', total: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY' },
  { personal: 'LIMIT_ANSWER_VISITOR_DAY', total: 'LIMIT_ANSWER_BOT_DAY' },
  { personal: 'LIMIT_ANSWER_BOT_DAY', total: 'LIMIT_ANSWER_GLOBAL_DAY' },
  { personal: 'LIMIT_SANDBOX_ACCOUNT_DAY', total: 'LIMIT_SANDBOX_GLOBAL_DAY' },
];

export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>> = process.env): ConfigValues {
  return checkConfig(WORKER_REQUIRED, WORKER_PAIRS, env, env.NODE_ENV === 'production');
}
