import { randomBytes } from 'node:crypto';
import type { PoolClient } from '@clipmaker/db';
import { UploadError } from './upload-contract';

// Called inside the caller's transaction; the partner row serializes first-code creation.
export async function ensurePartnerCode(tx: PoolClient, account: string) {
  const partner = (await tx.query<{ id: string }>(`INSERT INTO partner(account_id,display_name) VALUES($1,'Ведущий')
    ON CONFLICT(account_id) DO UPDATE SET account_id=EXCLUDED.account_id RETURNING id`, [account])).rows[0]!;
  const existing = (await tx.query<{ id: string; code: string }>(
    'SELECT id,code FROM partner_code WHERE partner_id=$1 ORDER BY created_at,id LIMIT 1', [partner.id])).rows[0];
  // A blocked personal code is retained, never replaced with a fresh active code.
  if (existing) return existing;
  return (await tx.query<{ id: string; code: string }>(`INSERT INTO partner_code(partner_id,code,status)
    VALUES($1,$2,'active') RETURNING id,code`, [partner.id, randomBytes(9).toString('base64url')])).rows[0]!;
}

// Account lock serializes campaign creation with account erasure and attribution.
export async function createOwnedPartnerCode(tx: PoolClient, account: string, code: string) {
  const active = await tx.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR NO KEY UPDATE", [account]);
  if (!active.rowCount) throw new UploadError('not_found', 'Аккаунт не найден', 404);
  const partner = (await tx.query<{ id: string }>(`INSERT INTO partner(account_id,display_name) VALUES($1,'Ведущий')
    ON CONFLICT(account_id) DO UPDATE SET account_id=EXCLUDED.account_id RETURNING id`, [account])).rows[0]!;
  // Lock every owned code, including currently active rows: a concurrent antifraud
  // update may still be uncommitted. Stable order avoids cross-code lock inversion.
  const owned = (await tx.query<{ id: string; code: string; status: 'active' | 'blocked' }>(
    'SELECT id,code,status FROM partner_code WHERE partner_id=$1 ORDER BY id FOR UPDATE', [partner.id])).rows;
  const existing = owned.find(row => row.code === code);
  if (existing) return existing;
  if (owned.some(row => row.status === 'blocked')) {
    throw new UploadError('conflict', 'Создание кодов недоступно до разблокировки', 409);
  }
  const inserted = await tx.query<{ id: string; code: string; status: 'active' | 'blocked' }>(`INSERT INTO partner_code(partner_id,code,status)
    VALUES($1,$2,'active') ON CONFLICT(code) DO NOTHING RETURNING id,code,status`, [partner.id, code]);
  if (!inserted.rows[0]) throw new UploadError('conflict', 'Код недоступен', 409);
  return inserted.rows[0];
}
