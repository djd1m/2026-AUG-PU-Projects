// Сборка сервера: хуки и маршруты. Сокет здесь НЕ открывается — это делает `bootstrap.ts`
// после проверки конфигурации. Разделение нужно тестам: они собирают тот же самый сервер
// и обращаются к нему через `inject`, не занимая порт.

import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { DbPool } from '@n4/db';
import { CANON, fail, type ApiConfig, type Logger } from '@n4/shared';
import { createRateLimiter, registerRateLimit, type RateLimiter } from './http/rate-limit.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthDeviceRoute } from './routes/auth-device.js';
import { registerScansRoutes } from './routes/scans.js';
import { clientAddressFrom, toIpPrefix } from './session/ip-prefix.js';
import { createPhotoStorage, type PhotoStorage } from './photo/store-original.js';

export interface ServerDeps {
  readonly config: ApiConfig;
  readonly pool: DbPool;
  readonly logger: Logger;
  /** Готовый ограничитель. По умолчанию создаётся ОДИН на сервер, а не на запрос. */
  readonly rateLimiter?: RateLimiter;
  /** Клиент приватного бакета фото (`scan-pipeline`, FR-scan-pipeline-1/14). Подменяется тестом. */
  readonly storage?: PhotoStorage;
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
  // Лимит multipart-плагина — ГРУБАЯ верхняя граница транспорта (запас 2× над бюджетом
  // фичи), а не содержательная проверка: точный литерал 12 582 912 байт (AC-scan-pipeline-3/33)
  // проверяет КОД маршрута (`validate-content.ts`) на уже полученном буфере и отвечает `413`.
  // Если бы лимит плагина стоял ВПЛОТНУЮ к 12 МБ, любой файл, реально ПРЕВЫШАЮЩИЙ его
  // (а не только пограничный), отклонялся бы плагином ДО домена и превращался в `422`
  // (ошибка разбора multipart), а не в правильный `413` — найдено интеграционным тестом.
  app.register(multipart, { limits: { fileSize: CANON.maxInputBytes * 2 } });

  const limiter = deps.rateLimiter ?? createRateLimiter(deps.config.rateLimits);
  const keyOf = (request: FastifyRequest): string =>
    toIpPrefix(clientAddressFrom(request.headers['x-forwarded-for'], request.ip));

  // Порядок регистрации — часть защиты: ограничитель частоты вешается на `onRequest`
  // ПЕРЕД любым маршрутом, поэтому он выполняется раньше разбора тела для ВСЕХ путей.
  registerRateLimit(app, limiter, keyOf);

  registerHealthRoute(app, deps.pool);
  registerAuthDeviceRoute(app, deps.pool, deps.logger);
  const storage = deps.storage ?? createPhotoStorage(deps.config.storage);
  registerScansRoutes(app, { pool: deps.pool, config: deps.config, storage, logger: deps.logger });

  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send(fail('not_found', 'маршрут не найден')));

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    // Текст ошибки наружу не уходит: он содержит внутренние подробности. В журнал —
    // класс отказа и маршрут, но не тело запроса и не cookie.
    deps.logger.error('request_failed', { route: request.routeOptions?.url ?? request.url, status, code: error.code });
    return reply.code(status).send(fail(status === 500 ? 'internal_error' : 'bad_request', status === 500 ? 'внутренняя ошибка' : 'запрос не принят'));
  });

  return app;
}
