// Сборка сервера: хуки и маршруты. Сокет здесь НЕ открывается — это делает `bootstrap.ts`
// после проверки конфигурации. Разделение нужно тестам: они собирают тот же самый сервер
// и обращаются к нему через `inject`, не занимая порт.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import type { DbPool } from '@n4/db';
import { fail, type ApiConfig, type Logger } from '@n4/shared';
import { createRateLimiter, registerRateLimit, type RateLimiter } from './http/rate-limit.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthDeviceRoute } from './routes/auth-device.js';
import { clientAddressFrom, toIpPrefix } from './session/ip-prefix.js';

export interface ServerDeps {
  readonly config: ApiConfig;
  readonly pool: DbPool;
  readonly logger: Logger;
  /** Готовый ограничитель. По умолчанию создаётся ОДИН на сервер, а не на запрос. */
  readonly rateLimiter?: RateLimiter;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    // Журнал Fastify выключен: свой структурированный журнал уже есть, а второй писал бы
    // те же события в другом формате и с другими правилами редактирования.
    logger: false,
    bodyLimit: 16 * 1024 * 1024,
    // Заголовку клиента доверия нет: адрес берётся явно из заголовка НАШЕГО Caddy,
    // и это единственное место, где он читается (`session/ip-prefix.ts`).
    trustProxy: false,
  });

  app.register(cookie);

  const limiter = deps.rateLimiter ?? createRateLimiter(deps.config.rateLimits);
  const keyOf = (request: FastifyRequest): string =>
    toIpPrefix(clientAddressFrom(request.headers['x-forwarded-for'], request.ip));

  // Идентификатор запроса и отметка начала — ПЕРВЫМ хуком, раньше ограничителя частоты:
  // отказ `429` тоже обязан находиться в журнале по идентификатору, иначе разбор жалобы
  // «меня отсекли» упирается во время и догадки.
  app.decorateRequest('n4RequestId', '');
  app.decorateRequest('n4StartedAt', 0);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const context = request as FastifyRequest & { n4RequestId: string; n4StartedAt: number };
    context.n4RequestId = randomUUID();
    context.n4StartedAt = Date.now();
  });

  // Порядок регистрации — часть защиты: ограничитель частоты вешается на `onRequest`
  // ПЕРЕД любым маршрутом, поэтому он выполняется раньше разбора тела для ВСЕХ путей.
  registerRateLimit(app, limiter, keyOf);

  registerHealthRoute(app, deps.pool);
  registerAuthDeviceRoute(app, deps.pool, deps.logger);

  app.setNotFoundHandler(async (request, reply) => {
    // Неизвестный маршрут ТОЖЕ пишется в журнал: всплеск `404` — это сигнал (сканер, битая
    // ссылка, чужая интеграция), и молчать о нём значит остаться без сигнала. В событии —
    // ровно то, что написали МЫ: постоянная метка `unmatched`, метод и статус. Ни пути, ни
    // его сегментов: их пишет клиент, и там приезжают токены и адреса (RV-foundation-01).
    const context = request as FastifyRequest & { n4RequestId?: string; n4StartedAt?: number };
    deps.logger.warn('request_not_found', {
      request_id: context.n4RequestId ?? 'unknown',
      route: 'unmatched',
      method: request.method,
      status: 404,
      duration_ms: context.n4StartedAt === undefined ? null : Date.now() - context.n4StartedAt,
    });
    return reply.code(404).send(fail('not_found', 'маршрут не найден'));
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    // Текст ошибки наружу не уходит: он содержит внутренние подробности. В журнал —
    // класс отказа и ШАБЛОН маршрута, но не тело запроса, не cookie и НЕ САМ ПУТЬ.
    //
    // ПУТЬ НЕ ЛОГИРУЕТСЯ ВООБЩЕ, и это третья редакция места — каждая предыдущая была
    // слабее ровно на один шаг:
    //   1) писали `request.url` целиком — в журнал уехали токен и адрес из query;
    //   2) отрезали query и писали путь — судья предъявил
    //      `/unknown/review-cookie-token-…/203.0.113.77`: СЕГМЕНТЫ пути пишет тот же клиент,
    //      что и query, и «очистить» их нечем.
    // Отсюда вывод, который и закреплён: в журнал попадает только то, что написали МЫ, —
    // шаблон зарегистрированного маршрута (`/api/v1/auth/device`), а у неизвестного пути
    // постоянная метка `unmatched`. Метод, статус и факт «шаблон не нашёлся» отвечают на
    // вопрос «куда стучались», не пересказывая пользовательский ввод.
    const context = request as FastifyRequest & { n4RequestId?: string; n4StartedAt?: number };
    deps.logger.error('request_failed', {
      request_id: context.n4RequestId ?? 'unknown',
      route: request.routeOptions?.url ?? 'unmatched',
      method: request.method,
      status,
      code: error.code,
      duration_ms: context.n4StartedAt === undefined ? null : Date.now() - context.n4StartedAt,
    });
    return reply.code(status).send(fail(status === 500 ? 'internal_error' : 'bad_request', status === 500 ? 'внутренняя ошибка' : 'запрос не принят'));
  });

  return app;
}
