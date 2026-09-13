// Оснастка тестов `partner-codes-and-cabinet`: партнёр, код, сессия устройства с
// управляемым `ip_prefix`/`account_id` — то, чего `seedSession` (общая оснастка) не даёт,
// а анти-фрод и самореферал без этого не воспроизвести.

import type { DbPool } from '@n4/db';

export interface SeededDeviceSession {
  readonly id: string;
}

/** Сессия устройства с ЯВНЫМ `ip_prefix` и, опционально, `account_id` (для самореферала). */
export async function seedDeviceSession(
  pool: DbPool,
  marker: string,
  options: { readonly ipPrefix?: string; readonly accountId?: string | null } = {},
): Promise<SeededDeviceSession> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days') RETURNING id`,
    [options.accountId ?? null, `hash-${marker}`, options.ipPrefix ?? '203.0.113.0/24'],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('device_session не создана');
  return { id: row.id };
}

/** Аккаунт напрямую (без входа через Telegram) — самореферал проверяется по `account_id`. */
export async function seedAccount(pool: DbPool, telegramUserId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id) VALUES ($1) RETURNING id`,
    [telegramUserId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('account не создан');
  return row.id;
}

export interface SeededPartner {
  readonly partnerId: string;
  readonly accountId: string | null;
}

/** Партнёр, опционально привязанный к аккаунту (владелец кода для самореферала). */
export async function seedPartner(pool: DbPool, displayName: string, accountId: string | null = null): Promise<SeededPartner> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact, account_id) VALUES ($1, $2, $3) RETURNING id`,
    [displayName, `${displayName}@example.test`, accountId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('partner не создан');
  return { partnerId: row.id, accountId };
}

export interface SeededPartnerCode {
  readonly id: string;
  readonly code: string;
}

export async function seedPartnerCode(
  pool: DbPool,
  partnerId: string,
  code: string,
  options: { readonly status?: 'active' | 'blocked'; readonly blockedReason?: 'antifraud_ip_burst' | 'manual' } = {},
): Promise<SeededPartnerCode> {
  const status = options.status ?? 'active';
  const result = await pool.query<{ id: string }>(
    `INSERT INTO partner_code (partner_id, code, status, blocked_reason, blocked_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'blocked' THEN now() ELSE NULL END) RETURNING id`,
    [partnerId, code, status, status === 'blocked' ? (options.blockedReason ?? 'manual') : null],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('partner_code не создан');
  return { id: row.id, code };
}

/** Посев N засчитанных применений (`growth_event(code_applied)`) с одного `ip_prefix` — anti-fraud окно. */
export async function seedCodeAppliedEvents(pool: DbPool, partnerCodeId: string, ipPrefix: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const session = await seedDeviceSession(pool, `afraud-seed-${partnerCodeId}-${i}-${Math.random().toString(36).slice(2)}`, { ipPrefix });
    await pool.query(`INSERT INTO growth_event (type, device_session_id, partner_code_id) VALUES ('code_applied', $1, $2)`, [
      session.id,
      partnerCodeId,
    ]);
  }
}

export async function attributionOf(pool: DbPool, deviceSessionId: string): Promise<
  | undefined
  | {
      readonly id: string;
      readonly status: string;
      readonly source: string;
      readonly replaced_source: string | null;
      readonly partner_code_id: string;
      readonly reject_reason: string | null;
      readonly activated_at: Date | null;
    }
> {
  const result = await pool.query(
    `SELECT id, status::text AS status, source::text AS source, replaced_source::text AS replaced_source,
            partner_code_id, reject_reason::text AS reject_reason, activated_at
     FROM attribution WHERE device_session_id = $1`,
    [deviceSessionId],
  );
  return result.rows[0];
}
