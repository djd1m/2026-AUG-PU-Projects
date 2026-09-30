// Фабрика боевой двери (08_review.md F-2). Провайдер live создаётся ТОЛЬКО здесь и сразу закрывается внутри PaidGateway
// (приватное поле): у вызывающего нет объекта с методами embed/answer, значит нет и пути к модели в обход резерва.
// OpenRouterProvider из входа пакета не экспортируется; `new OpenRouterProvider(` и `new PaidGateway(` в боевом коде
// допустимы только в этом файле, адрес OpenRouter — только в адаптере (страж S-11, packages/rag/tests/unit/guards.test.ts).

import type { Limits, Pool } from '@n6b/db';
import { PaidGateway } from './paid-call.js';
import { OpenRouterProvider } from './provider/openrouter.js';

export interface LiveGatewayOptions {
  /** OPENROUTER_API_KEY из Boot config check. */
  readonly apiKey: string;
  /** Служебный пул (n6b_app_service). */
  readonly pool: Pool;
  /** Потолки из limitsFrom (Boot config check). */
  readonly limits: Limits;
  /** VISITOR_SECRET — нужен процессу web для канала visitor; воркеру не нужен. */
  readonly visitorSecret?: string;
  readonly log?: (line: string) => void;
}

export function createLiveGateway(options: LiveGatewayOptions): PaidGateway {
  return new PaidGateway({ pool: options.pool, provider: new OpenRouterProvider(options.apiKey), limits: options.limits,
    visitorSecret: options.visitorSecret, log: options.log });
}
