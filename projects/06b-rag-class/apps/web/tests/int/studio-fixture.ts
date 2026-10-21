import { randomBytes } from 'node:crypto';
import type { Pool } from '@n6b/db';
import { AuthService } from '@/server/auth';
import { PgAuthStore } from '@/server/auth-store';
import { uniq } from '../../../../packages/db/tests/int/helpers';

export const BASE = 'https://studio.example.test';
const SECRET = 'studio-test-session-secret';
export function studioAuth(service: Pool) {
  return new AuthService(new PgAuthStore(service), { hash: async () => 'fixture', compare: async () => true }, SECRET);
}
/** Operator fixture creates an honest kind; API authentication still uses real PG session lookup. */
export async function seedActor(owner: Pool, service: Pool, kind: 'owner' | 'studio' = 'studio', parent: string | null = null) {
  const accountId = (await owner.query<{ id: string }>(`INSERT INTO account (email, kind, parent_account_id, studio_access)
    VALUES ($1, $2, $3, $4) RETURNING id`, [`${uniq('stu')}@example.test`, kind, parent, parent !== null])).rows[0]!.id;
  const token = randomBytes(32).toString('base64url');
  await new PgAuthStore(service).createSession(accountId, { tokenHash: studioAuth(service).tokenHash(token),
    expiresAt: new Date(Date.now() + 86400000) });
  return { accountId, token };
}
export function post(token: string, body?: unknown, extra: Record<string, string> = {}) {
  return new Request(BASE, { method: 'POST', headers: { origin: BASE, cookie: `n6b_session=${token}`,
    'content-type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
export async function seedReferralBot(owner: Pool, accountId: string) {
  const publicId = randomBytes(9).toString('base64url');
  const botId = (await owner.query<{ id: string }>(`INSERT INTO bot (account_id, public_id, name)
    VALUES ($1, $2, 'Referral fixture') RETURNING id`, [accountId, publicId])).rows[0]!.id;
  return { publicId, botId };
}
/** Observe an actual PG lock wait instead of relying on timing sleeps to order the race. */
export async function waitForLock(owner: Pool, pid: number) {
  const deadline = Date.now() + 3000;
  do {
    const row = (await owner.query<{ waiting: boolean }>(`SELECT wait_event_type = 'Lock' AS waiting
      FROM pg_stat_activity WHERE pid = $1`, [pid])).rows[0];
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  throw new Error('Expected a real PostgreSQL lock wait within 3 seconds');
}
