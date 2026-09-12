// Анонимная сессия устройства (FR-foundation-4, `CreateDeviceSession`).
//
// В базе лежит ТОЛЬКО хэш токена: утечка дампа не должна выдавать действующие сессии.
// Сырое значение уходит в cookie и не хранится нигде — ни в строке, ни в журнале.
//
// Неизвестный или подделанный токен трактуется как ОТСУТСТВИЕ сессии: выдаётся новая,
// прежняя не воскрешается и не изменяется.

import { createHash, randomBytes } from 'node:crypto';
import type { DbClient, DbPool } from '@n4/db';
import { CANON } from '@n4/shared';

/** Имя cookie сессии. Значение в JavaScript не читается — фронту оно не нужно. */
export const SESSION_COOKIE_NAME = 'n4_session';
/** 32 байта = 256 бит энтропии при требовании «не меньше 128». */
const TOKEN_BYTES = 32;

export interface DeviceSessionRow {
  readonly id: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
  readonly ip_prefix: string;
  readonly account_id: string | null;
  readonly anonymous_diary_expires_at: Date;
}

export interface SessionOutcome {
  readonly session: DeviceSessionRow;
  /** Сырой токен возвращается ТОЛЬКО при создании — его надо положить в cookie. */
  readonly issuedToken?: string;
  readonly created: boolean;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

const SELECT_BY_HASH = `
  UPDATE device_session SET last_seen_at = now()
  WHERE cookie_token_hash = $1
  RETURNING id, created_at, last_seen_at, ip_prefix, account_id, anonymous_diary_expires_at
`;

const INSERT_SESSION = `
  INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
  VALUES ($1, $2, now() + ($3 || ' days')::interval)
  RETURNING id, created_at, last_seen_at, ip_prefix, account_id, anonymous_diary_expires_at
`;

/**
 * Возвращает существующую сессию по действующей cookie либо создаёт новую.
 * Повторный вызов с действующей cookie НЕ создаёт вторую строку — он обновляет
 * `last_seen_at`, и это видно по неизменному числу строк.
 */
export async function createOrReuseDeviceSession(
  executor: DbPool | DbClient,
  input: { readonly presentedToken: string | undefined; readonly ipPrefix: string },
): Promise<SessionOutcome> {
  if (input.presentedToken !== undefined && input.presentedToken.trim() !== '') {
    const existing = await executor.query<DeviceSessionRow>(SELECT_BY_HASH, [hashSessionToken(input.presentedToken)]);
    const row = existing.rows[0];
    if (row !== undefined) return { session: row, created: false };
    // Неизвестный токен — это отсутствие сессии. Ни воскрешения, ни правки чужой строки.
  }

  const token = generateSessionToken();
  const created = await executor.query<DeviceSessionRow>(INSERT_SESSION, [
    hashSessionToken(token),
    input.ipPrefix,
    String(CANON.anonymousDiaryDays),
  ]);
  const row = created.rows[0];
  if (row === undefined) throw new Error('сессия не создана: вставка не вернула строку');
  return { session: row, issuedToken: token, created: true };
}
