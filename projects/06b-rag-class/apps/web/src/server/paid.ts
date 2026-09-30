// Решения процесса web, читающие потолки расходов и ключ модели (CFG-I5: проверенная при старте переменная обязана
// читаться решением). Ключи попытки строит сама дверь PaidGateway из канала (08_review.md F-1); провайдер создаётся
// только фабрикой createLiveGateway и наружу не выходит (F-2). Маршруты ответа (виджет, демо, песочница) подключают это в
// фичах rag-answer-sandbox, widget, demo-page: getRuntime().paid.gateway.beginAnswer({ kind: 'visitor', ip, botId }, …).

import { type Limits, limitsFrom, type Pool } from '@n6b/db';
import { createLiveGateway, type PaidGateway } from '@n6b/rag';
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

export interface PaidRuntime {
  readonly limits: Limits;
  /** Единственная дверь к платным вызовам процесса web (провайдер live закреплён внутри). */
  readonly gateway: PaidGateway;
}

export function createPaidRuntime(config: WebConfig, servicePool: Pool): PaidRuntime {
  const limits = webLimits(config);
  const gateway = createLiveGateway({ apiKey: config.OPENROUTER_API_KEY, pool: servicePool, limits,
    visitorSecret: config.VISITOR_SECRET, log: (line) => console.warn(line) });
  return { limits, gateway };
}
