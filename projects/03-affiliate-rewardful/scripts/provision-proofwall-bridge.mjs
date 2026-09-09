// Explicit operator action inside the N3 API container; JSON stdin, never CLI secrets.
// The caller must durably store the generated connector before invoking this script.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/app/package.json');
const { Client } = require('pg');
const tenant = 'b439d03a-1156-48a6-b807-49bf77d44103';
const partner = 'cb8662f3-8deb-494a-a220-e27fbbebf354';
const landing = 'https://proofwall.aicoding.space/n3/start';
const returning = 'https://proofwall.aicoding.space/dashboard';
const check = condition => { if (!condition) throw new Error('Provisioning precondition failed'); };
let client;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  check(input?.tenantId === tenant && typeof input.connectorKey === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.connectorKey));
  const digest = createHash('sha256').update(input.connectorKey).digest('hex');
  client = new Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE, user: process.env.PGUSER,
    password: readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim() });
  await client.connect();
  const candidates = (await client.query(`SELECT m.id,m.account_id,m.actor_id FROM n3.memberships m
    JOIN n3.tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND t.mode='real'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(t.state->'actors') a
      WHERE a->>'id'=m.actor_id::text AND a->>'role'='merchant')`, [tenant])).rows;
  check(candidates.length === 1); const owner = candidates[0];
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='2s'");
  await client.query("SET LOCAL statement_timeout='5s'");
  const account = (await client.query('SELECT id,version FROM n3.accounts WHERE id=$1 FOR SHARE', [owner.account_id])).rows[0];
  const member = (await client.query(`SELECT actor_id FROM n3.memberships WHERE id=$1
    AND account_id=$2 AND tenant_id=$3 FOR SHARE`, [owner.id, owner.account_id, tenant])).rows[0];
  const state = (await client.query("SELECT state FROM n3.tenants WHERE id=$1 AND mode='real' FOR UPDATE", [tenant])).rows[0]?.state;
  check(account && member && state?.runId === tenant);
  check(state.actors.some(a => a.id === member.actor_id && a.role === 'merchant'));
  check(state.policyConfigured?.includes('cash') && state.policies.findLast(p => p.kind === 'cash')?.publishedAt);
  check(state.actors.some(a => a.id === partner && a.role === 'partner') && state.enrollments.some(e => e.actorId === partner && e.consent === true));
  check((await client.query('SELECT actor_id FROM n3.memberships WHERE tenant_id=$1 AND actor_id=$2', [tenant, partner])).rowCount === 1);
  const existing = (await client.query('SELECT * FROM n3.referral_credentials WHERE tenant_id=$1 FOR UPDATE', [tenant])).rows[0];
  // Never rotate an existing key, including expired keys, through this provisioning script.
  check(!existing || (existing.token_hash === digest && existing.account_id === account.id &&
    existing.version === account.version && !existing.revoked_at && new Date(existing.expires_at).getTime() > Date.now()));
  const program = (await client.query('SELECT landing_url,return_url FROM n3.referral_programs WHERE tenant_id=$1', [tenant])).rows[0];
  check(!program || (program.landing_url === landing && program.return_url === returning));
  await client.query(`INSERT INTO n3.referral_programs(tenant_id,landing_url,return_url,updated_at)
    VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(tenant_id) DO NOTHING`, [tenant, landing, returning]);
  if (!existing) await client.query(`INSERT INTO n3.referral_credentials
    (token_hash,tenant_id,account_id,version,expires_at,created_at)
    VALUES($1,$2,$3,$4,clock_timestamp()+interval '90 days',clock_timestamp())`, [digest, tenant, account.id, account.version]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ configured: true, reusedKey: !!existing, tenantId: tenant, landingUrl: landing }));
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error('Provisioning refused or failed; no credentials logged.'); process.exitCode = 1;
} finally { if (client) await client.end(); }
