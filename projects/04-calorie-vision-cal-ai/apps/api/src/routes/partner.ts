// `GET /api/v1/partner/dashboard?window=day|week|all` — PartnerDashboard (маршрут 8 канона,
// FR-partner-codes-and-cabinet-9/10/11).
//
// Аутентификация — ТОТ ЖЕ контракт, что `DELETE /api/v1/account` (`routes/account-delete.ts`):
// токен из cookie ИЛИ заголовка `Authorization: Bearer`, сессия обязана быть связана с
// аккаунтом (`device_session.account_id IS NOT NULL`) — без входа через Telegram кабинета
// не существует. Отсутствие входа — `401`; вход есть, но аккаунт не партнёр — `403`
// (`.claude/rules/security.md`, единственное поименованное исключение из правила «чужое =
// 404»): ответ не подтверждает и не опровергает существование чужого кода, а лишь то, что
// ВЫЗЫВАЮЩИЙ не партнёр.
//
// AC-partner-codes-and-cabinet-17 (страж по исходнику, `dashboard-server-authority-guard.
// test.ts`): код кабинета разрешается ИСКЛЮЧИТЕЛЬНО из `accountId` этой сессии. Значение из
// `request.query`/`request.body` в вызов `queryPartnerDashboard` НЕ передаётся никогда —
// проверять этот файл на попытку прочитать оттуда `code`.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok } from '@n4/shared';
import { queryPartnerDashboard, type DashboardWindow } from '../partner/dashboard-query.js';
import { SESSION_COOKIE_NAME } from '../session/create-device-session.js';

function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/.exec(value);
  return match?.[1];
}

/**
 * `raw` разбирается из `unknown` (query — внешний вход) через явное сравнение с закрытым
 * множеством, а не приводится типом (`coding-style.md`: `req as CustomType` — известные
 * грабли стека). `undefined` по умолчанию — `day`; форма вне множества — `invalid`.
 */
function parseWindow(raw: string | undefined): DashboardWindow | 'invalid' {
  if (raw === undefined) return 'day';
  if (raw === 'day' || raw === 'week' || raw === 'all') return raw;
  return 'invalid';
}

interface DashboardQuery {
  readonly window?: string;
}

export function registerPartnerRoutes(app: FastifyInstance, pool: DbPool): void {
  app.get<{ Querystring: DashboardQuery }>('/api/v1/partner/dashboard', async (request: FastifyRequest<{ Querystring: DashboardQuery }>, reply) => {
    const { createHash } = await import('node:crypto');
    const token = request.cookies[SESSION_COOKIE_NAME] ?? bearerToken(request.headers.authorization);
    if (token === undefined || token.trim() === '') {
      return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    }

    const hash = createHash('sha256').update(token, 'utf8').digest('hex');
    const sessionResult = await pool.query<{ account_id: string | null }>('SELECT account_id FROM device_session WHERE cookie_token_hash = $1', [
      hash,
    ]);
    const accountId = sessionResult.rows[0]?.account_id;
    if (accountId === null || accountId === undefined) {
      return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    }

    const window = parseWindow(request.query.window);
    if (window === 'invalid') {
      return reply.code(422).send(fail('invalid_window', 'window обязан быть day, week или all'));
    }

    // Код кабинета — ТОЛЬКО из accountId этой сессии (AC-17). Никакого чтения
    // `request.query.code`/`request.body` здесь и не может быть: `queryPartnerDashboard`
    // не принимает параметра кода вовсе.
    const outcome = await queryPartnerDashboard(pool, { accountId, window });
    if (outcome.outcome === 'not_partner') {
      return reply.code(403).send(fail('not_partner', 'вызывающий не является партнёром'));
    }

    return reply.code(200).send(ok(outcome.data));
  });
}
