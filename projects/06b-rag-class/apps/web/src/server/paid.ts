// Решения процесса web, читающие потолки расходов и ключ модели (CFG-I5: проверенная при старте переменная обязана
// читаться решением). Пределы превращаются в ключи ТОЛЬКО через quota-keys.ts, провайдер зовётся ТОЛЬКО через PaidGateway.
// Маршруты ответа (виджет, демо, песочница) подключают это в фичах rag-answer-sandbox, widget, demo-page.

import { answerKeys, type Limits, limitsFrom, type Pool, type QuotaKey, sandboxKeys, visitorKey } from '@n6b/db';
import { type ModelProvider, OpenRouterProvider, PaidGateway } from '@n6b/rag';
import type { WebConfig } from './config';

/** Потолки из проверенной конфигурации. limitsFrom повторно сверяет «персональный ≤ общего». */
export function webLimits(config: WebConfig): Limits {
  return limitsFrom({
    LIMIT_ANSWER_VISITOR_DAY: config.LIMIT_ANSWER_VISITOR_DAY,
    LIMIT_ANSWER_BOT_DAY: config.LIMIT_ANSWER_BOT_DAY,
    LIMIT_ANSWER_GLOBAL_DAY: config.LIMIT_ANSWER_GLOBAL_DAY,
    LIMIT_SANDBOX_ACCOUNT_DAY: config.LIMIT_SANDBOX_ACCOUNT_DAY,
    LIMIT_SANDBOX_GLOBAL_DAY: config.LIMIT_SANDBOX_GLOBAL_DAY,
    LIMIT_EMBED_TOKENS_ACCOUNT_DAY: config.LIMIT_EMBED_TOKENS_ACCOUNT_DAY,
    LIMIT_EMBED_TOKENS_GLOBAL_DAY: config.LIMIT_EMBED_TOKENS_GLOBAL_DAY,
  });
}

/** Боевой провайдер всегда `live`: селектора fake/live в окружении нет (01_plan.md §7). */
export function liveProvider(config: WebConfig): ModelProvider {
  return new OpenRouterProvider(config.OPENROUTER_API_KEY);
}

export interface PaidRuntime {
  readonly limits: Limits;
  readonly gateway: PaidGateway;
  /** Ключи попытки ответа посетителю: HMAC префикса /24·/64 + bot_id → посетитель, бот, все. */
  visitorAnswerKeys(ip: string, botId: string): QuotaKey[];
  /** Ключи попытки ответа в песочнице: аккаунт, все аккаунты. */
  sandboxAnswerKeys(accountId: string): QuotaKey[];
}

export function createPaidRuntime(config: WebConfig, servicePool: Pool,
  provider: ModelProvider = liveProvider(config)): PaidRuntime {
  const limits = webLimits(config);
  const gateway = new PaidGateway({ pool: servicePool, provider, log: (line) => console.warn(line) });
  return {
    limits,
    gateway,
    visitorAnswerKeys: (ip, botId) => answerKeys(limits, visitorKey(config.VISITOR_SECRET, ip, botId), botId),
    sandboxAnswerKeys: (accountId) => sandboxKeys(limits, accountId),
  };
}
