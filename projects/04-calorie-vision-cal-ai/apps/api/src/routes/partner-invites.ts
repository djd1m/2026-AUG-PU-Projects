// Приглашение партнёра (OWN-012). Роль партнёра выдаётся ГРАНТОМ владельца, не полем клиента —
// образец N3a (`api/enrollments/*`), перенесена форма, не код.
//
// `POST /api/v1/admin/partners/:partnerId/invites` — владелец создаёт одноразовую ссылку;
// `GET  /api/v1/partner/invites/:token`             — предпросмотр для того, кто открыл ссылку;
// `POST /api/v1/partner/enroll`                      — вошедший аккаунт принимает приглашение.
//
// Токен — 32 случайных байта, в базе ТОЛЬКО его sha256: утечка таблицы не даёт ни одной
// рабочей ссылки. Срок — 7 суток. Принятие — в транзакции с `FOR UPDATE` на приглашении:
// два одновременных принятия одной ссылки дадут ОДНУ привязку, второе — `410`.

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withTransaction, type DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { requireOwner, type OwnerLists } from './admin.js';

export interface PartnerInvitesDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  readonly owners: OwnerLists;
  /** Внешний адрес — ссылка приглашения обязана открываться у блогера, а не на localhost. */
  readonly appOrigin: string;
}

const INVITE_TTL_DAYS = 7;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,50}$/;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

type EnrollFailure = 'invalid' | 'partner_taken' | 'account_is_partner';
class EnrollError extends Error {
  constructor(readonly reason: EnrollFailure) {
    super(reason);
  }
}

export function registerPartnerInvitesRoutes(app: FastifyInstance, deps: PartnerInvitesDeps): void {
  app.post('/api/v1/admin/partners/:partnerId/invites', async (request: FastifyRequest<{ Params: { partnerId: string } }>, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps.owners })) === null) return reply.code(404).send(fail('not_found', 'маршрут не найден'));
    const partner = await deps.pool.query<{ id: string; account_id: string | null }>(`SELECT id, account_id FROM partner WHERE id = $1`, [request.params.partnerId]);
    const row = partner.rows[0];
    if (row === undefined) return reply.code(404).send(fail('not_found', 'партнёр не найден'));
    if (row.account_id !== null) return reply.code(409).send(fail('partner_taken', 'у этого партнёра уже есть аккаунт'));

    const token = randomBytes(32).toString('base64url');
    const expires = await deps.pool.query<{ expires_at: Date }>(
      `INSERT INTO partner_invite (partner_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))
       RETURNING expires_at`,
      [row.id, hashInviteToken(token), INVITE_TTL_DAYS],
    );
    deps.logger.info('partner_invite_created', { partner_id: row.id });
    return reply.code(201).send(ok({ url: `${deps.appOrigin}/invite/${token}`, expires_at: expires.rows[0]!.expires_at.toISOString() }));
  });

  app.get('/api/v1/partner/invites/:token', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const token = request.params.token;
    if (!TOKEN_RE.test(token)) return reply.code(404).send(fail('not_found', 'приглашение не найдено'));
    const found = await deps.pool.query<{ display_name: string; valid: boolean }>(
      `SELECT p.display_name, (i.used_at IS NULL AND i.expires_at > now() AND p.account_id IS NULL) AS valid
       FROM partner_invite i JOIN partner p ON p.id = i.partner_id WHERE i.token_hash = $1`,
      [hashInviteToken(token)],
    );
    const row = found.rows[0];
    if (row === undefined || !row.valid) return reply.code(404).send(fail('not_found', 'приглашение не найдено или уже использовано'));
    return reply.code(200).send(ok({ partner_display_name: row.display_name, commission_rate_bp: 5000 }));
  });

  app.post('/api/v1/partner/enroll', async (request: FastifyRequest<{ Body: { token?: unknown } }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(401).send(fail('account_required', 'принять приглашение может только вошедший аккаунт'));
    const token = request.body?.token;
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return reply.code(404).send(fail('not_found', 'приглашение не найдено'));
    const accountId = session.accountId;

    try {
      const partnerId = await withTransaction(deps.pool, async (client) => {
        const invite = await client.query<{ id: string; partner_id: string; valid: boolean }>(
          `SELECT id, partner_id, (used_at IS NULL AND expires_at > now()) AS valid FROM partner_invite WHERE token_hash = $1 FOR UPDATE`,
          [hashInviteToken(token)],
        );
        const inv = invite.rows[0];
        if (inv === undefined || !inv.valid) throw new EnrollError('invalid');
        const already = await client.query(`SELECT 1 FROM partner WHERE account_id = $1`, [accountId]);
        if (already.rows.length > 0) throw new EnrollError('account_is_partner');
        const bound = await client.query(`UPDATE partner SET account_id = $2 WHERE id = $1 AND account_id IS NULL`, [inv.partner_id, accountId]);
        if ((bound.rowCount ?? 0) === 0) throw new EnrollError('partner_taken');
        await client.query(`UPDATE partner_invite SET used_at = now(), used_by_account_id = $2 WHERE id = $1`, [inv.id, accountId]);
        return inv.partner_id;
      });
      deps.logger.info('partner_enrolled', { partner_id: partnerId });
      return reply.code(200).send(ok({ partner_id: partnerId }));
    } catch (error) {
      if (error instanceof EnrollError) {
        if (error.reason === 'invalid') return reply.code(410).send(fail('invite_gone', 'приглашение просрочено или уже использовано'));
        if (error.reason === 'account_is_partner') return reply.code(409).send(fail('already_partner', 'этот аккаунт уже партнёр'));
        return reply.code(409).send(fail('partner_taken', 'у этого партнёра уже есть аккаунт'));
      }
      deps.logger.error('enroll_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });
}
