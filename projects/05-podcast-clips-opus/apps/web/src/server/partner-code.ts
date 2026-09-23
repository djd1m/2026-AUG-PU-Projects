import { randomBytes } from 'node:crypto';
import type { PoolClient } from '@clipmaker/db';

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
