// Сборка сервера: хуки и маршруты. Сокет здесь НЕ открывается — это делает `bootstrap.ts`
// после проверки конфигурации. Разделение нужно тестам: они собирают тот же самый сервер
// и обращаются к нему через `inject`, не занимая порт.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { DbPool } from '@n4/db';
import { CANON, fail, type ApiConfig, type Logger } from '@n4/shared';
import { createRateLimiter, registerRateLimit, type RateLimiter } from './http/rate-limit.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthDeviceRoute } from './routes/auth-device.js';
import { registerScansRoutes } from './routes/scans.js';
import { registerAuthTelegramRoute } from './routes/auth-telegram.js';
import { registerConsentRoute } from './routes/consent.js';
import { registerAccountDeleteRoute } from './routes/account-delete.js';
import { registerInterestRoute } from './routes/interest.js';
import { registerDiaryRoutes } from './routes/diary.js';
import { registerCodesRoutes } from './routes/codes.js';
import { registerPartnerRoutes } from './routes/partner.js';
import { registerScansCorrectRoute } from './routes/scans-correct.js';
import { registerScansPhotoRoute } from './routes/scans-photo.js';
import { registerShareCardsRoute } from './routes/share-cards.js';
import { registerShareCardInternalRoute } from './routes/share-card-internal.js';
import { registerSubscriptionRoutes } from './routes/subscription.js';
import { registerPaymentsWebhookRoute } from './routes/payments-webhook.js';
import { registerEarningsRoute } from './routes/earnings.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthEmailRoutes } from './routes/auth-email.js';
import { registerPartnerInvitesRoutes } from './routes/partner-invites.js';
import { registerAdminPartnersRoutes } from './routes/admin-partners.js';
import { registerExportRoutes } from './routes/exports.js';
import { registerNotificationsRoutes } from './routes/notifications.js';
import { registerPayoutDetailsRoutes } from './routes/payout-details.js';
import { createTelegramSender } from './notifications/notify.js';
import { selectPaymentProvider } from './payments/select-provider.js';
import type { PaymentProvider } from './payments/provider.js';
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
  /** Платёжный провайдер. Подменяется тестом детерминированным фейком; в проде выбирается
   * из окружения, и «не настроено» там валит старт, а не откатывается к фейку. */
  readonly payments?: PaymentProvider;
  /** Владельцы кабинета. Подменяется тестом; в проде — закрытые списки в `routes/admin.ts`. */
  readonly ownerTelegramUserIds?: readonly number[];
  readonly ownerEmails?: readonly string[];
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
  const storage = deps.storage ?? createPhotoStorage(deps.config.storage);
  registerScansRoutes(app, { pool: deps.pool, config: deps.config, storage, logger: deps.logger });
  registerAuthTelegramRoute(app, deps.pool, deps.config, deps.logger);
  registerConsentRoute(app, deps.pool, deps.logger);
  registerAccountDeleteRoute(app, deps.pool, deps.logger);
  registerInterestRoute(app, { pool: deps.pool, logger: deps.logger });
  registerDiaryRoutes(app, { pool: deps.pool, logger: deps.logger });
  registerCodesRoutes(app, { pool: deps.pool, logger: deps.logger });
  registerPartnerRoutes(app, deps.pool);
  registerScansCorrectRoute(app, { pool: deps.pool, storage, logger: deps.logger });
  // FR-LOOK-007/DEC-A-050: `photo_url` из GET/`correct` указывает СЮДА, а не на хранилище
  // напрямую (`photo/photo-url.ts` объясняет почему). Уже проксируется Caddy как часть
  // `/api/*` — инфраструктура не менялась.
  registerScansPhotoRoute(app, { pool: deps.pool, storage, logger: deps.logger });
  registerShareCardsRoute(app, { pool: deps.pool, storage, logger: deps.logger });
  // `/internal/*` — НЕ входит в канон `/api/v1` (ровно 14) и не проксируется `Caddyfile`
  // наружу; вызывается только `apps/web` изнутри сети compose (`routes/share-card-internal.ts`).
  registerShareCardInternalRoute(app, { pool: deps.pool, storage });

  // Подписка и комиссия. Провайдер выбирается ОДИН раз при старте: экземпляр на запрос
  // означал бы новый HTTP-клиент и новые проверки конфигурации на каждом обращении.
  const payments = deps.payments ?? selectPaymentProvider(deps.config.payments);
  registerSubscriptionRoutes(app, {
    pool: deps.pool,
    payments,
    priceMinor: deps.config.subscription.priceMinor,
    appOrigin: deps.config.appOrigin,
    logger: deps.logger,
  });
  registerEarningsRoute(app, { pool: deps.pool });
  registerAdminRoutes(app, {
    pool: deps.pool,
    logger: deps.logger,
    ownerTelegramUserIds: deps.ownerTelegramUserIds,
    ownerEmails: deps.ownerEmails,
    notificationSender: deps.config.telegramBotToken === '' ? undefined : createTelegramSender(deps.config.telegramBotToken),
  });
  // OWN-012: PWA-родная идентичность и грант партнёра.
  const owners = { ownerTelegramUserIds: deps.ownerTelegramUserIds, ownerEmails: deps.ownerEmails };
  registerAuthEmailRoutes(app, { pool: deps.pool, logger: deps.logger, owners });
  registerPartnerInvitesRoutes(app, { pool: deps.pool, logger: deps.logger, owners, appOrigin: deps.config.appOrigin });
  registerAdminPartnersRoutes(app, { pool: deps.pool, logger: deps.logger, owners });
  registerExportRoutes(app, { pool: deps.pool, logger: deps.logger, owners });
  registerNotificationsRoutes(app, { pool: deps.pool, logger: deps.logger });
  registerPayoutDetailsRoutes(app, { pool: deps.pool, logger: deps.logger, owners, holdDays: deps.config.subscription.holdDays });
  registerPaymentsWebhookRoute(app, {
    // Уведомления в Telegram — только тем партнёрам, у кого аккаунт связан с Telegram, и
    // только как НАДСТРОЙКА над строкой в базе. Токен уже есть у `api` и больше нигде.
    notificationSender: deps.config.telegramBotToken === '' ? undefined : createTelegramSender(deps.config.telegramBotToken),
    pool: deps.pool,
    payments,
    priceMinor: deps.config.subscription.priceMinor,
    holdDays: deps.config.subscription.holdDays,
    periodDays: deps.config.subscription.periodDays,
    logger: deps.logger,
  });

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
