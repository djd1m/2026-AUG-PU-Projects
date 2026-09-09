import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

if (!process.env.TEST_DATABASE_URL) throw new Error('isolated TEST_DATABASE_URL is required');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET = 'n3-test-session-secret-at-least-16';
process.env.BASE_URL = 'https://proofwall.test';
process.env.N3_BRIDGE_ENABLED = 'true';
export const TENANT = '11111111-1111-4111-8111-111111111111';
process.env.N3_TENANT_ID = TENANT;
process.env.N3_BASE_URL = 'https://n3.example.test';
process.env.N3_CONNECTOR_KEY = 'n'.repeat(43);
process.env.YOOKASSA_SHOP_ID = 'fixture-shop';
process.env.PAYMENTS_STUB = 'false';
export const { withService, withAccount, pool, closePool } = await import('@proofwall/db');
const { createSession, hashSessionToken } = await import('../../src/lib/session');
const accounts: string[] = [];
export async function seed(referred = true) {
  return withService(async client => {
    const id = randomUUID(), email = `${id}@example.com`, projectId = randomUUID();
    await client.query('insert into accounts(id,email,password_hash) values($1,$2,$3)', [id, email, 'fixture-hash']);
    await client.query('insert into projects(id,account_id,slug) values($1,$2,$3)', [projectId, id, `n3-${id.slice(0,18)}`]);
    const token = await createSession(client, id);
    if (referred) await client.query('insert into n3_signup_contexts(account_id,tenant_id,visit_token) values($1,$2,$3)', [id, TENANT, 'v'.repeat(43)]);
    accounts.push(id);
    return { accountId: id, email, projectId, sessionHash: hashSessionToken(token), token };
  });
}
export async function bound(accountId: string, email: string) {
  await withService(client => client.query('insert into n3_email_proofs(account_id,id,email,bound_at) values($1,$2,$3,now())', [accountId, randomUUID(), email]));
}
export async function cleanup() {
  for (const id of accounts) await pool.query('delete from accounts where id=$1', [id]);
  await closePool();
}
export async function rollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('begin'); await client.query('set local role app_service'); return await fn(client); }
  finally { await client.query('rollback'); client.release(); }
}
