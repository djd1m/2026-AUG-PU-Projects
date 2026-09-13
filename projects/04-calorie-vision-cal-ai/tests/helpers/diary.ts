// Оснастка тестов `diary-and-streak`: заводит `recognition` в статусе `done` с реалистичным
// снимком позиций (та же форма, что пишет `apps/recognizer/src/recognize/recognize-scan.ts`,
// `persistedItem`: `label_ru`, `mass_g`, `unmatched`, `food_item_id`, `source_snapshot`).

import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';

export function cookieValue(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('Set-Cookie отсутствует');
  return raw.split(';')[0]?.split('=')[1] ?? '';
}

export interface DeviceFixture {
  readonly token: string;
  readonly sessionId: string;
}

/** Заводит анонимную сессию устройства и возвращает её токен cookie и `device_session.id`. */
export async function deviceSession(app: FastifyInstance, pool: DbPool, ip: string): Promise<DeviceFixture> {
  const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': ip } });
  const token = cookieValue(device.headers['set-cookie']);
  const row = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [hashSessionToken(token)]);
  const sessionId = row.rows[0]?.id;
  if (sessionId === undefined) throw new Error('device_session не найдена');
  return { token, sessionId };
}

/** Даёт согласие ТЕКУЩЕМУ владельцу сессии (аккаунт, если связана, иначе сама сессия). */
export async function grantConsent(app: FastifyInstance, token: string): Promise<void> {
  const hash = computeConsentTextHash('2026-09-v1') ?? '';
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/consent',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: hash },
  });
  if (response.statusCode !== 200) throw new Error(`grantConsent не удался: ${response.statusCode} ${response.body}`);
}

export function patchDiary(app: FastifyInstance, token: string, entryId: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/diary/${entryId}`,
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    payload: body,
  });
}

export function getDiary(app: FastifyInstance, token: string, date: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/diary?date=${encodeURIComponent(date)}`,
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

export interface RawDiaryItem {
  readonly label_ru: string;
  readonly mass_g: number;
  readonly unmatched: boolean;
  readonly food_item_id: string | null;
  readonly source_snapshot: Record<string, unknown> | null;
}

export const RICE_SNAPSHOT = { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28 };

export function riceItem(massG = 250): RawDiaryItem {
  return { label_ru: 'рис', mass_g: massG, unmatched: false, food_item_id: 'rice-fixture', source_snapshot: RICE_SNAPSHOT };
}

export interface SeedRecognitionInput {
  readonly deviceSessionId: string;
  readonly accountId?: string | null;
  readonly status?: 'queued' | 'done' | 'failed' | 'refused';
  readonly items?: readonly RawDiaryItem[];
  readonly failureReason?: string | null;
}

/** Заводит `recognition` напрямую (минуя конвейер распознавания — этой фиче он не нужен). */
export async function seedRecognition(pool: DbPool, input: SeedRecognitionInput): Promise<string> {
  const status = input.status ?? 'done';
  const items = input.items ?? [riceItem()];
  const result = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, account_id, status, items, failure_reason)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id`,
    [input.deviceSessionId, input.accountId ?? null, status, JSON.stringify(items), input.failureReason ?? null],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('recognition не создана');
  return row.id;
}
