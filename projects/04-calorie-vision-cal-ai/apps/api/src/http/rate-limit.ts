// Ограничение частоты ДО разбора тела (FR-foundation-8, `security-operation-order`).
//
// Хук `onRequest` — САМЫЙ РАННИЙ в жизненном цикле Fastify: он выполняется прежде, чем
// тело запроса будет прочитано и разобрано. Обратный порядок (`preHandler`) делает
// перебор мусорными телами БЕСПЛАТНЫМ: разбор происходит до счётчика, и защита считает
// только те запросы, которые уже стоили работы.
//
// Экземпляр создаётся ОДИН раз при старте процесса. Экземпляр на запрос обнуляет
// собственную защиту: у каждого запроса был бы свой пустой счётчик.
//
// Ключ — `ip_prefix`, а не полный адрес: полного у нас нет нигде.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fail, type RateLimits } from '@n4/shared';

const WINDOW_MS = 60_000;

export interface RateLimiter {
  /** `true` — запрос разрешён; `false` — порог исчерпан. */
  consume(key: string, bucket: 'mutate' | 'read', now?: number): { allowed: boolean; limit: number; remaining: number; resetAt: number };
  size(): number;
}

interface Counter {
  count: number;
  windowStart: number;
}

/**
 * Окно фиксированной длины в минуту. Значения порогов приходят из ПРОВЕРЕННОЙ
 * конфигурации, а не из литералов в коде: незаданный порог валит старт (`env.ts`).
 */
export function createRateLimiter(limits: RateLimits): RateLimiter {
  const counters = new Map<string, Counter>();

  const prune = (now: number): void => {
    if (counters.size < 10_000) return;
    for (const [key, counter] of counters) {
      if (now - counter.windowStart >= WINDOW_MS) counters.delete(key);
    }
  };

  return {
    consume(key, bucket, now = Date.now()) {
      const limit = bucket === 'mutate' ? limits.mutatePerMinute : limits.readPerMinute;
      const mapKey = `${bucket}:${key}`;
      const existing = counters.get(mapKey);
      if (existing === undefined || now - existing.windowStart >= WINDOW_MS) {
        prune(now);
        counters.set(mapKey, { count: 1, windowStart: now });
        return { allowed: true, limit, remaining: limit - 1, resetAt: now + WINDOW_MS };
      }
      existing.count += 1;
      const resetAt = existing.windowStart + WINDOW_MS;
      if (existing.count > limit) return { allowed: false, limit, remaining: 0, resetAt };
      return { allowed: true, limit, remaining: limit - existing.count, resetAt };
    },
    size() {
      return counters.size;
    },
  };
}

/** Чтение отделено от мутации порогом канона: 120/мин против 30/мин (DEC-A-013). */
export function bucketFor(method: string): 'mutate' | 'read' {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'mutate';
}

export function registerRateLimit(
  app: FastifyInstance,
  limiter: RateLimiter,
  keyOf: (request: FastifyRequest) => string,
): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = limiter.consume(keyOf(request), bucketFor(request.method));
    reply.header('RateLimit-Limit', String(decision.limit));
    reply.header('RateLimit-Remaining', String(decision.remaining));
    if (decision.allowed) return;
    reply.header('Retry-After', String(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000))));
    // Тело запроса на этом пути НЕ разбиралось: ответ `400 invalid json` здесь невозможен
    // по построению, и именно этим тест отличает правильный порядок от обратного.
    await reply.code(429).send(fail('rate_limited', 'слишком много запросов с этого адреса, попробуйте через минуту'));
  });
}
