import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withService } from '@proofwall/db';
import type { HumanContext, PaymentsEngine } from '@course/agent-payments';
import { lockProofAuthority, issueN3Proof, consumeN3Proof, type ProofAuthority } from '../n3-proof';
import { baseUrl } from '../urls';
import { AgentHostError, audience, digest, merchantId, TOKEN } from './security';

/** Shared DB rate limiter: each denied attempt is bounded by a persisted window. */
export async function limit(
  client: PoolClient,
  scope: string,
  key: string,
  count: number,
  seconds: number,
) {
  await client.query('select pg_advisory_xact_lock(90020,hashtext($1))', [`${scope}:${key}`]);
  const recent = await client.query(
    `select count(*)::int as n from rate_limit_events
    where scope=$1 and key=$2 and created_at>clock_timestamp()-$3*interval '1 second'`,
    [scope, key, seconds],
  );
  if (recent.rows[0].n >= count) throw new AgentHostError('RATE_LIMITED', 429);
  await client.query('insert into rate_limit_events(scope,key) values($1,$2)', [scope, key]);
}
export async function startPairing(displayName: string, expectedAudience: string, key: string) {
  if (expectedAudience !== audience()) throw new AgentHostError('INVALID_AUDIENCE');
  const pollToken = randomBytes(32).toString('base64url');
  const pairing = await withService(async (client) => {
    await limit(client, 'agent_pair_start', key, 10, 600);
    return (
      await client.query(
        `insert into agent_payment_pairings(poll_hash,display_name,audience,expires_at)
      values($1,$2,$3,clock_timestamp()+interval '10 minutes') returning id,expires_at`,
        [digest(pollToken), displayName, expectedAudience],
      )
    ).rows[0];
  });
  return {
    pairingId: pairing.id,
    pollToken,
    approvalUrl: `${baseUrl()}/agent-payments?pairingId=${pairing.id}`,
    expiresAt: pairing.expires_at.toISOString(),
  };
}
export async function pairingStatus(pairingId: string, token: string, key: string) {
  if (!TOKEN.test(token)) throw new AgentHostError('INVALID_INPUT');
  await withService((client) => limit(client, 'agent_pair_poll', key, 120, 60));
  return withService(async (client) => {
    const row = (
      await client.query(
        `select consumed_at,grant_id,expires_at>clock_timestamp() as live
      from agent_payment_pairings where id=$1 and poll_hash=$2`,
        [pairingId, digest(token)],
      )
    ).rows[0];
    if (!row) throw new AgentHostError('PAIRING_NOT_FOUND', 404);
    return {
      status: row.grant_id ? 'approved' : row.live && !row.consumed_at ? 'pending' : 'expired',
    };
  });
}
export async function verified(client: PoolClient, accountId: string, email: string) {
  const result = await client.query(
    `select 1 from n3_email_proofs where account_id=$1 and email=$2
    union all select 1 from agent_payment_email_proofs where account_id=$1 and email=$2`,
    [accountId, email],
  );
  return Boolean(result.rowCount);
}
export async function humanContext(auth: ProofAuthority, slug: string): Promise<HumanContext> {
  return withService(async (client) => {
    const email = await lockProofAuthority(client, auth);
    if (!(await verified(client, auth.accountId, email)))
      throw new AgentHostError('EMAIL_PROOF_REQUIRED', 409);
    const project = (
      await client.query('select id from projects where account_id=$1 and slug=$2', [
        auth.accountId,
        slug,
      ])
    ).rows[0];
    if (!project) throw new AgentHostError('PROJECT_NOT_FOUND', 404);
    return {
      merchantId: merchantId(),
      buyerId: auth.accountId,
      resourceId: project.id,
      humanId: auth.accountId,
      consentReference: `session:${auth.sessionHash}`,
    };
  });
}
export async function approvePairing(
  auth: ProofAuthority,
  slug: string,
  pairingId: string,
  engine: PaymentsEngine,
) {
  // Persist one-use claim BEFORE grant issuance. A crash may require a fresh pairing;
  // it cannot issue a second authority or make a raw token visible in polling.
  const human = await humanContext(auth, slug);
  const row = await withService(async (client) => {
    await lockProofAuthority(client, auth);
    await limit(client, 'agent_pair_confirm', auth.accountId, 10, 600);
    return (
      await client.query(
        `update agent_payment_pairings set consumed_at=clock_timestamp(),account_id=$2
      where id=$1 and consumed_at is null and expires_at>clock_timestamp() returning audience`,
        [pairingId, auth.accountId],
      )
    ).rows[0];
  });
  if (!row || row.audience !== audience()) throw new AgentHostError('PAIRING_EXPIRED', 409);
  const grant = await engine.issueGrant(human, {
    audience: audience(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await withService((client) =>
    client.query('update agent_payment_pairings set grant_id=$2 where id=$1', [
      pairingId,
      grant.grantId,
    ]),
  );
  return grant;
}
export async function issueEmail(auth: ProofAuthority, ip: string) {
  const referred = await withService((client) =>
    client.query('select 1 from n3_signup_contexts where account_id=$1', [auth.accountId]),
  );
  if (referred.rowCount)
    return { ...(await withService((client) => issueN3Proof(client, auth, ip))), referred: true };
  return withService(async (client) => {
    const email = await lockProofAuthority(client, auth);
    if (await verified(client, auth.accountId, email))
      return { alreadyVerified: true as const, referred: false };
    await limit(client, 'agent_email_account', auth.accountId, 5, 3600);
    await limit(client, 'agent_email_ip', digest(ip), 30, 3600);
    await limit(client, 'agent_email_cooldown', auth.accountId, 1, 60);
    await client.query(
      'update agent_payment_email_tokens set used_at=now() where account_id=$1 and used_at is null',
      [auth.accountId],
    );
    const token = randomBytes(32).toString('base64url');
    const inserted = await client.query(
      `insert into agent_payment_email_tokens(account_id,email,session_hash,token_hash,expires_at)
      values($1,$2,$3,$4,clock_timestamp()+interval '24 hours') returning id`,
      [auth.accountId, email, auth.sessionHash, digest(token)],
    );
    return {
      alreadyVerified: false as const,
      token,
      email,
      id: inserted.rows[0].id,
      referred: false,
    };
  });
}
export async function verifyEmail(auth: ProofAuthority, token: string) {
  if (!TOKEN.test(token)) throw new AgentHostError('INVALID_INPUT');
  return withService(async (client) => {
    const email = await lockProofAuthority(client, auth);
    const referred = await client.query('select 1 from n3_signup_contexts where account_id=$1', [
      auth.accountId,
    ]);
    if (referred.rowCount) return consumeN3Proof(client, auth, token);
    const consumed = await client.query(
      `update agent_payment_email_tokens set used_at=clock_timestamp()
      where token_hash=$1 and account_id=$2 and email=$3 and session_hash=$4 and used_at is null
      and expires_at>clock_timestamp() returning id`,
      [digest(token), auth.accountId, email, auth.sessionHash],
    );
    if (!consumed.rowCount) return false;
    await client.query(
      `insert into agent_payment_email_proofs(account_id,email) values($1,$2)
      on conflict(account_id) do update set email=excluded.email,verified_at=clock_timestamp()`,
      [auth.accountId, email],
    );
    return true;
  });
}
