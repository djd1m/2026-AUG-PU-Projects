import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { enqueueN3 } from '../../../../services/worker/src/n3-outbox';
import { N3Error } from '../../../../services/worker/src/n3-client';

export interface ProofAuthority { accountId: string; sessionHash: string }
export const hashProofToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export async function lockProofAuthority(client: PoolClient, auth: ProofAuthority): Promise<string> {
  await client.query("set local lock_timeout='2s'");
  const account = await client.query('select email from accounts where id=$1 for no key update', [auth.accountId]);
  const session = await client.query(`select id from sessions where account_id=$1 and token_hash=$2
    and revoked_at is null and expires_at>clock_timestamp() for update`, [auth.accountId, auth.sessionHash]);
  if (!account.rows[0] || !session.rows[0]) throw new N3Error('N3_SESSION_REQUIRED', 401);
  // A lock wait can cross expiry: recheck after lock acquisition, with wall clock.
  const fresh = await client.query('select 1 from sessions where id=$1 and revoked_at is null and expires_at>clock_timestamp()', [session.rows[0].id]);
  if (!fresh.rowCount) throw new N3Error('N3_SESSION_REQUIRED', 401);
  return account.rows[0].email;
}
export async function issueN3Proof(client: PoolClient, auth: ProofAuthority, ip: string) {
  const email = await lockProofAuthority(client, auth);
  const context = await client.query('select 1 from n3_signup_contexts where account_id=$1', [auth.accountId]);
  if (!context.rowCount) throw new N3Error('N3_NOT_REFERRED', 409);
  const proof = await client.query('select 1 from n3_email_proofs where account_id=$1 and email=$2', [auth.accountId, email]);
  if (proof.rowCount) return { alreadyVerified: true as const };
  const ipKey = hashProofToken(ip);
  const lock = await client.query('select pg_try_advisory_xact_lock(90019,hashtext($1)) as ok', [ipKey]);
  if (!lock.rows[0].ok) throw new N3Error('N3_RATE_LIMIT', 429);
  const limits = await client.query(`select
    count(*) filter(where key=$1 and scope='n3_proof_account')::int as account_count,
    count(*) filter(where key=$2 and scope='n3_proof_ip')::int as ip_count,
    count(*) filter(where key=$1 and scope='n3_proof_account' and created_at>now()-interval '60 seconds')::int as cooldown
    from rate_limit_events where created_at>now()-interval '1 hour' and scope in ('n3_proof_account','n3_proof_ip')`,
  [auth.accountId, ipKey]);
  const counts = limits.rows[0];
  if (counts.account_count >= 5 || counts.ip_count >= 30 || counts.cooldown > 0) throw new N3Error('N3_RATE_LIMIT', 429);
  await client.query('insert into rate_limit_events(scope,key) values($1,$2),($3,$4)',
    ['n3_proof_account', auth.accountId, 'n3_proof_ip', ipKey]);
  await client.query('update n3_email_tokens set used_at=now() where account_id=$1 and used_at is null', [auth.accountId]);
  const token = randomBytes(32).toString('base64url');
  const inserted = await client.query(`insert into n3_email_tokens(account_id,email,session_hash,token_hash,expires_at)
    values($1,$2,$3,$4,now()+interval '24 hours') returning id`,
  [auth.accountId, email, auth.sessionHash, hashProofToken(token)]);
  return { alreadyVerified: false as const, token, email, id: inserted.rows[0].id as string };
}
export async function consumeN3Proof(client: PoolClient, auth: ProofAuthority, token: string): Promise<boolean> {
  const email = await lockProofAuthority(client, auth);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const consumed = await client.query(`update n3_email_tokens set used_at=clock_timestamp()
    where token_hash=$1 and account_id=$2 and email=$3 and session_hash=$4
      and used_at is null and expires_at>clock_timestamp() returning id`,
  [hashProofToken(token), auth.accountId, email, auth.sessionHash]);
  if (!consumed.rows[0]) return false;
  const context = (await client.query('select * from n3_signup_contexts where account_id=$1', [auth.accountId])).rows[0];
  if (!context) throw new N3Error('N3_NOT_REFERRED', 409);
  const payload = { customerId: auth.accountId, email, emailVerified: true,
    ...(context.visit_token ? { visitToken: context.visit_token } : {}), ...(context.promo_code ? { promoCode: context.promo_code } : {}) };
  await enqueueN3(client, auth.accountId, 'signup', `${auth.accountId}:${consumed.rows[0].id}`, payload);
  await client.query(`insert into n3_email_proofs(account_id,id,email) values($1,$2,$3)
    on conflict(account_id) do update set id=excluded.id,email=excluded.email,verified_at=now(),bound_at=null`,
  [auth.accountId, consumed.rows[0].id, email]);
  return true;
}
