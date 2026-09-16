// Вход по почте и паролю (OWN-012: PWA — первый приоритет).
//
// `POST /api/v1/auth/register` · `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` ·
// `GET /api/v1/auth/me`. Расширение закрытого списка маршрутов канона — объявлено в
// `docs/decisions-owner.md` (OWN-012), не добавлено молча.
//
// Регистрация НЕ предшествует ценности: посетитель снимает, ведёт дневник и делится анонимно,
// а аккаунт заводит тогда, когда ему нужно то, что живёт дольше устройства — подписка или
// кабинет. Поэтому и регистрация, и вход СВЯЗЫВАЮТ текущую сессию устройства с аккаунтом
// тем же кодом, что и вход через Telegram (`auth/link-session-to-account.ts`): дневник,
// карточки и сканы, сделанные до входа, переезжают на аккаунт.
//
// Порядок на входе — `security-operation-order.md`: ограничитель частоты (общий, до разбора
// тела) → валидация формы → KDF. Вход по несуществующей почте всё равно считает KDF против
// хеша-заглушки: время ответа не должно отличать «нет такой почты» от «пароль не тот».

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withTransaction, type DbPool } from '@n4/db';
import { CANON, fail, ok, type Logger } from '@n4/shared';
import { createOrReuseDeviceSession, SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';
import { linkSessionToAccount } from '../auth/link-session-to-account.js';
import { dummyHash, hashPassword, isValidPassword, normalizeEmail, verifyPassword } from '../auth/password.js';
import { requireSession } from './scans.js';
import { isOwnerAccount, type OwnerLists } from './admin.js';

interface CredentialsBody {
  readonly email?: unknown;
  readonly password?: unknown;
}

export interface AuthEmailDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  readonly owners: OwnerLists;
}

class EmailTakenError extends Error {}
class AccountErasingError extends Error {}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CANON.anonymousDiaryDays * 24 * 60 * 60,
  });
}

export function registerAuthEmailRoutes(app: FastifyInstance, deps: AuthEmailDeps): void {
  app.post('/api/v1/auth/register', async (request: FastifyRequest<{ Body: CredentialsBody }>, reply: FastifyReply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    if (email === null) return reply.code(422).send(fail('invalid_email', 'почта не похожа на адрес'));
    if (!isValidPassword(body.password)) return reply.code(422).send(fail('invalid_password', 'пароль — от 8 до 200 знаков'));

    const passwordHash = await hashPassword(body.password);
    const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
    const ipPrefix = toIpPrefix(address);
    const presentedToken = request.cookies[SESSION_COOKIE_NAME];

    try {
      const outcome = await withTransaction(deps.pool, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO account (email, password_hash, tier, status) VALUES ($1, $2, 'free', 'active')
           ON CONFLICT (lower(email)) WHERE status <> 'erased' AND email IS NOT NULL DO NOTHING
           RETURNING id`,
          [email, passwordHash],
        );
        const row = inserted.rows[0];
        if (row === undefined) throw new EmailTakenError();
        const session = await createOrReuseDeviceSession(client, { presentedToken, ipPrefix });
        await linkSessionToAccount(client, {
          sessionId: session.session.id,
          accountId: row.id,
          sessionWasUnlinked: session.session.account_id === null,
        });
        return { accountId: row.id, issuedToken: session.issuedToken };
      });
      if (outcome.issuedToken !== undefined) setSessionCookie(reply, outcome.issuedToken);
      deps.logger.info('account_registered_email', { ip_prefix: ipPrefix });
      return reply.code(201).send(ok({ email }));
    } catch (error) {
      if (error instanceof EmailTakenError) return reply.code(409).send(fail('email_taken', 'на эту почту уже есть аккаунт — войдите'));
      deps.logger.error('register_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });

  app.post('/api/v1/auth/login', async (request: FastifyRequest<{ Body: CredentialsBody }>, reply: FastifyReply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    // Одна и та же ошибка на плохую форму и на неверную пару: форма здесь не раскрывает,
    // существует ли почта.
    if (email === null || !isValidPassword(body.password)) return reply.code(401).send(fail('invalid_credentials', 'почта или пароль неверны'));

    const found = await deps.pool.query<{ id: string; password_hash: string | null; status: string }>(
      `SELECT id, password_hash, status FROM account WHERE lower(email) = $1 AND status <> 'erased'`,
      [email],
    );
    const account = found.rows[0];
    const storedHash = account?.password_hash ?? (await dummyHash());
    const verified = await verifyPassword(storedHash, body.password);
    if (account === undefined || !verified) return reply.code(401).send(fail('invalid_credentials', 'почта или пароль неверны'));
    if (account.status !== 'active') return reply.code(409).send(fail('account_erasing', 'аккаунт удаляется, вход закрыт'));

    const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
    const ipPrefix = toIpPrefix(address);
    const presentedToken = request.cookies[SESSION_COOKIE_NAME];
    try {
      const outcome = await withTransaction(deps.pool, async (client) => {
        const session = await createOrReuseDeviceSession(client, { presentedToken, ipPrefix });
        const link = await linkSessionToAccount(client, {
          sessionId: session.session.id,
          accountId: account.id,
          sessionWasUnlinked: session.session.account_id === null,
        });
        return { issuedToken: session.issuedToken, diaryMigrated: link.diaryMigrated };
      });
      if (outcome.issuedToken !== undefined) setSessionCookie(reply, outcome.issuedToken);
      return reply.code(200).send(ok({ email, diary_migrated: outcome.diaryMigrated }));
    } catch (error) {
      if (error instanceof AccountErasingError) return reply.code(409).send(fail('account_erasing', 'аккаунт удаляется, вход закрыт'));
      deps.logger.error('login_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });

  // Выход — отвязка ЭТОЙ сессии устройства от аккаунта. Cookie остаётся: анонимная сессия
  // с её дневником продолжает жить, как жила до входа.
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));
    await deps.pool.query(`UPDATE device_session SET account_id = NULL WHERE id = $1`, [session.deviceSessionId]);
    return reply.code(200).send(ok({ logged_out: true }));
  });

  // Кто я: экрану настроек и кабинету нужно знать, вошёл ли посетитель и в каких ролях.
  // Роль владельца НЕ раскрывается постороннему: она вычисляется по тому же закрытому списку,
  // что и маршруты кабинета, и для не-владельца просто `false`.
  app.get('/api/v1/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(200).send(ok({ authenticated: false }));
    const account = await deps.pool.query<{ email: string | null; telegram_user_id: string | null; tier: string }>(
      `SELECT email, telegram_user_id, tier FROM account WHERE id = $1`,
      [session.accountId],
    );
    const row = account.rows[0];
    if (row === undefined) return reply.code(200).send(ok({ authenticated: false }));
    const partner = await deps.pool.query<{ id: string }>(`SELECT id FROM partner WHERE account_id = $1`, [session.accountId]);
    const owner = isOwnerAccount({ telegramUserId: row.telegram_user_id, email: row.email }, deps.owners);
    return reply.code(200).send(ok({
      authenticated: true,
      email: row.email,
      telegram_linked: row.telegram_user_id !== null,
      tier: row.tier,
      partner: partner.rows.length > 0,
      owner,
    }));
  });
}
