// Студия: приглашение «Передать клиенту», приём, кабинет студии (фича partner-and-studio; FR-PARTNER-002, FR-GROWTH-004,
// SC-US-012-1/2; Pseudocode StudioInvite). НАПИСАНО ЗАНОВО: в донорах N1/N4/N5 нет передачи владения ресурсом по
// приглашению; форма токена (32 байта, в БД — sha256) — N1 projects/01-testimonials-senja/apps/web/src/lib/partner-auth.ts.
//
// Приём — ОДНА транзакция: строки ДВУХ аккаунтов запираются в порядке id (встречные «принять» не дают deadlock), затем
// предел ботов КЛИЕНТА считается под той же блокировкой строки аккаунта, что и CreateBot (carry_over A-N6-033 (6)):
// одновременные «создать бота» и «принять» у одного клиента не превышают предел. Блокировка кода партнёра
// (applyPartnerCodeTx) берётся ПОСЛЕ — её держатели строк аккаунтов не ждут.
import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { lockAccountBots } from './bots.js';
import { isUuid } from './index-jobs.js';
import { applyPartnerCodeTx, type ApplyOutcome } from './partners.js';
import { transaction } from './quota.js';

export const INVITE_TTL_DAYS = 7;
export const INVITE_TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/;
export const inviteTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

type Db = Pool | PoolClient;
async function lockAccountRows(tx: PoolClient, ids: string[]): Promise<void> {
  await tx.query('SELECT id FROM account WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
}

// Код студии для атрибуции invite: первый код, которым владеет студия; нет — выдаётся `studio-<6 символов>` (FR-GROWTH-004:
// «персональный код студии»). Уникальность кода — индексом; коллизия случайной части — повтор.
export async function ensureStudioCode(db: Db, studioAccountId: string): Promise<string> {
  const own = (await db.query<{ code: string }>(`SELECT code FROM partner_code WHERE owner_account_id = $1 ORDER BY created_at, code LIMIT 1`,
    [studioAccountId])).rows[0];
  if (own) return own.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `studio-${randomBytes(4).toString('base64url').slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    const inserted = await db.query<{ code: string }>(`INSERT INTO partner_code (code, owner_account_id, "group") VALUES ($1, $2, 'studio')
      ON CONFLICT (code) DO NOTHING RETURNING code`, [code, studioAccountId]);
    if (inserted.rows[0]) {
      await db.query(`INSERT INTO partner_audit (partner_code_id, account_id, kind, reason)
        SELECT id, $2, 'code_issued', 'код студии при первом приглашении' FROM partner_code WHERE code = $1`, [code, studioAccountId]);
      return code;
    }
  }
  throw new Error('Не удалось выдать код студии: коллизии пять раз подряд');
}

export type CreateInviteResult =
  | { kind: 'created'; token: string; expiresAt: string }
  | { kind: 'not_found' | 'not_studio' | 'transferred' | 'contact_required' };
// «Передать клиенту» (SC-US-012-1): только план studio и только СВОЙ бот, ещё не переданный. Прежнее неиспользованное
// приглашение этого бота гасится (одна живая ссылка на бота). Токен возвращается ОДИН раз — в БД только хэш.
export function createStudioInvite(pool: Pool, input: { studioAccountId: string; botId: string; email: string }): Promise<CreateInviteResult> {
  if (!isUuid(input.studioAccountId) || !isUuid(input.botId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const studio = await lockAccountBots(tx, input.studioAccountId);
    if (!studio) return { kind: 'not_found' } as const;
    const bot = (await tx.query<{ studio_account_id: string | null; contact: string | null }>(`SELECT studio_account_id, contact FROM bot
      WHERE id = $1 AND account_id = $2 AND status = 'active' FOR UPDATE`, [input.botId, input.studioAccountId])).rows[0];
    if (!bot) return { kind: 'not_found' } as const;
    if (studio.plan !== 'studio') return { kind: 'not_studio' } as const;
    if (bot.studio_account_id !== null) return { kind: 'transferred' } as const;
    // Без контакта «не знаю» бот клиенту не отвечает — передавать его нечего (тот же довод, что у InstallSnippet).
    if (!bot.contact) return { kind: 'contact_required' } as const;
    await ensureStudioCode(tx, input.studioAccountId);
    await tx.query('DELETE FROM studio_invite WHERE bot_id = $1 AND accepted_by IS NULL', [input.botId]);
    const token = randomBytes(32).toString('base64url');
    const row = (await tx.query<{ id: string; expires_at: Date }>(`INSERT INTO studio_invite (bot_id, studio_account_id, token_hash, email, expires_at)
      VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id, expires_at`,
    [input.botId, input.studioAccountId, inviteTokenHash(token), input.email, INVITE_TTL_DAYS])).rows[0]!;
    await tx.query(`INSERT INTO growth_event (type, bot_id, account_id, dedup_key) VALUES ('invite_sent', $1, $2, $3) ON CONFLICT (type, dedup_key) DO NOTHING`,
      [input.botId, input.studioAccountId, `invite_sent:${row.id}`]);
    return { kind: 'created', token, expiresAt: row.expires_at.toISOString() } as const;
  });
}

export interface InvitePreview { company_name: string; expires_at: string; state: 'open' | 'expired' | 'accepted' }
// Экран приглашения: название бота и срок — без почты и кода студии. Неизвестный токен — null (404).
export async function readInvite(pool: Pool, token: string): Promise<InvitePreview | null> {
  if (!INVITE_TOKEN_FORM.test(token)) return null;
  const row = (await pool.query<{ company_name: string; expires_at: Date; accepted: boolean; expired: boolean }>(
    `SELECT b.company_name, i.expires_at, i.accepted_by IS NOT NULL AS accepted, i.expires_at <= now() AS expired
     FROM studio_invite i JOIN bot b ON b.id = i.bot_id WHERE i.token_hash = $1 AND b.status = 'active'`, [inviteTokenHash(token)])).rows[0];
  if (!row) return null;
  return { company_name: row.company_name, expires_at: row.expires_at.toISOString(), state: row.accepted ? 'accepted' : row.expired ? 'expired' : 'open' };
}

export type AcceptInviteResult =
  | { kind: 'accepted'; botId: string; attribution: ApplyOutcome | 'no_code' }
  | { kind: 'not_found' | 'expired' | 'used' | 'own_invite' }
  | { kind: 'plan_limit'; plan: string; limit: number };
// Приём (SC-US-012-2): клиент — владелец бота, студия — «только чтение» (bot.studio_account_id), атрибуция invite к коду
// студии. Истёкшее — 410, использованное — 409, предел ботов клиента — отказ, бот остаётся у студии.
export function acceptStudioInvite(pool: Pool, input: { token: string; clientAccountId: string; ipPrefix: string }): Promise<AcceptInviteResult> {
  if (!INVITE_TOKEN_FORM.test(input.token) || !isUuid(input.clientAccountId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const found = (await tx.query<{ studio_account_id: string }>('SELECT studio_account_id FROM studio_invite WHERE token_hash = $1',
      [inviteTokenHash(input.token)])).rows[0];
    if (!found) return { kind: 'not_found' } as const;
    if (found.studio_account_id === input.clientAccountId) return { kind: 'own_invite' } as const;
    await lockAccountRows(tx, [found.studio_account_id, input.clientAccountId]);
    // Перечитать ПОСЛЕ блокировок: второй принимающий видит accepted_by первого.
    const invite = (await tx.query<{ id: string; bot_id: string; accepted: boolean; expired: boolean }>(`SELECT id, bot_id,
        accepted_by IS NOT NULL AS accepted, expires_at <= now() AS expired FROM studio_invite WHERE token_hash = $1 FOR UPDATE`,
    [inviteTokenHash(input.token)])).rows[0];
    if (!invite) return { kind: 'not_found' } as const;
    if (invite.accepted) return { kind: 'used' } as const;
    if (invite.expired) return { kind: 'expired' } as const;
    const bot = (await tx.query(`SELECT 1 FROM bot WHERE id = $1 AND account_id = $2 AND studio_account_id IS NULL AND status = 'active' FOR UPDATE`,
      [invite.bot_id, found.studio_account_id])).rowCount;
    if (!bot) return { kind: 'expired' } as const;          // бот удалён или уже передан — приглашение больше не действует
    const client = await lockAccountBots(tx, input.clientAccountId);
    if (!client) return { kind: 'not_found' } as const;
    if (client.count >= client.limit) return { kind: 'plan_limit', plan: client.plan, limit: client.limit } as const;
    await tx.query('UPDATE bot SET account_id = $2, studio_account_id = $3 WHERE id = $1', [invite.bot_id, input.clientAccountId, found.studio_account_id]);
    await tx.query('UPDATE studio_invite SET accepted_by = $2, accepted_at = now() WHERE id = $1', [invite.id, input.clientAccountId]);
    await tx.query(`INSERT INTO growth_event (type, bot_id, account_id, dedup_key) VALUES ('invite_accepted', $1, $2, $3) ON CONFLICT (type, dedup_key) DO NOTHING`,
      [invite.bot_id, input.clientAccountId, `invite_accepted:${invite.id}`]);
    const code = (await tx.query<{ code: string }>(`SELECT code FROM partner_code WHERE owner_account_id = $1 ORDER BY created_at, code LIMIT 1`,
      [found.studio_account_id])).rows[0];
    const attribution = code ? await applyPartnerCodeTx(tx, { accountId: input.clientAccountId, code: code.code, source: 'invite', ipPrefix: input.ipPrefix }) : 'no_code';
    return { kind: 'accepted', botId: invite.bot_id, attribution } as const;
  });
}

export interface StudioBotView { bot_id: string; company_name: string; transferred: boolean; answered_7d: number; unknown_7d: number; installs: number }
export interface StudioCabinet {
  plan: string; code: string | null;
  bots: StudioBotView[];
  cohort: { invites_accepted: number; installs_30d: number; answers_30d: number; conversions: number } | null;
}
// Кабинет студии (FR-GROWTH-004): свои боты и переданные клиентам — ТОЛЬКО числа (тексты вопросов посетителей клиента
// студии не показываются: бот уже принадлежит клиенту, A-N6-045). Когорта по коду студии за 30 дней; нет ни одной
// принятой передачи — cohort = null («данных ещё нет», не 0 %).
export async function readStudioCabinet(pool: Pool, accountId: string): Promise<StudioCabinet | null> {
  if (!isUuid(accountId)) return null;
  const account = (await pool.query<{ plan: string }>(`SELECT plan FROM account WHERE id = $1 AND status = 'active'`, [accountId])).rows[0];
  if (!account) return null;
  const code = (await pool.query<{ id: string; code: string }>(`SELECT id, code FROM partner_code WHERE owner_account_id = $1 ORDER BY created_at, code LIMIT 1`,
    [accountId])).rows[0] ?? null;
  const bots = (await pool.query<{ id: string; company_name: string; transferred: boolean; answered: number; unknown: number; installs: number }>(
    `SELECT b.id, b.company_name, b.studio_account_id = $1 AS transferred,
       (SELECT count(*)::int FROM question_log q WHERE q.bot_id = b.id AND q.visitor_session_id IS NOT NULL AND q.outcome = 'answered' AND q.created_at > now() - interval '7 days') AS answered,
       (SELECT count(*)::int FROM question_log q WHERE q.bot_id = b.id AND q.visitor_session_id IS NOT NULL AND q.outcome = 'unknown' AND q.created_at > now() - interval '7 days') AS unknown,
       (SELECT count(*)::int FROM widget_install w WHERE w.bot_id = b.id) AS installs
     FROM bot b WHERE (b.account_id = $1 OR b.studio_account_id = $1) AND b.status = 'active' ORDER BY b.created_at, b.id`, [accountId])).rows;
  let cohort: StudioCabinet['cohort'] = null;
  if (code) {
    const row = (await pool.query<{ accepted: number; installs: number; answers: number; conversions: number }>(`SELECT
        (SELECT count(*)::int FROM studio_invite WHERE studio_account_id = $1 AND accepted_at > now() - interval '30 days') AS accepted,
        (SELECT count(*)::int FROM widget_install w JOIN bot b ON b.id = w.bot_id WHERE b.studio_account_id = $1 AND w.first_config_at > now() - interval '30 days') AS installs,
        (SELECT count(*)::int FROM question_log q JOIN bot b ON b.id = q.bot_id WHERE b.studio_account_id = $1 AND q.outcome = 'answered'
           AND q.visitor_session_id IS NOT NULL AND q.created_at > now() - interval '30 days') AS answers,
        (SELECT count(*)::int FROM attribution WHERE partner_code_id = $2 AND status = 'converted') AS conversions`, [accountId, code.id])).rows[0]!;
    if (row.accepted + row.installs + row.answers + row.conversions > 0) {
      cohort = { invites_accepted: row.accepted, installs_30d: row.installs, answers_30d: row.answers, conversions: row.conversions };
    }
  }
  return { plan: account.plan, code: code?.code ?? null, cohort,
    bots: bots.map((b) => ({ bot_id: b.id, company_name: b.company_name, transferred: b.transferred, answered_7d: b.answered, unknown_7d: b.unknown, installs: b.installs })) };
}
