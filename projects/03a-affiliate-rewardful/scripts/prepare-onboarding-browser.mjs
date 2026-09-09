// Synthetic fixtures only, executed by the isolated harness with its private migrator role.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { bootstrapPilotOwner } from './bootstrap-pilot-owner.ts';
const namespace = process.env.N3A_DISPOSABLE_TEST_NAMESPACE;
const url = process.env.TEST_DATABASE_URL_MIGRATE;
const encoded = process.env.IDENTITY_SECRET;
if (!/^n3a-foundation-[a-f0-9]{12}$/.test(namespace ?? '') || !url || new URL(url).username !== 'n3a_migrator' || !encoded) {
  throw new Error('browser_fixture_requires_disposable_namespace');
}
const directory = path.resolve('.runtime', namespace);
await mkdir(directory, { recursive: true, mode: 0o700 });
const evidence = (reference) => ({ reference, sha256: createHash('sha256').update(reference).digest('hex') });
const owner = { identity: `owner-${randomBytes(5).toString('hex')}@example.test`, password: randomBytes(24).toString('base64url') };
const partner = { identity: `partner-${randomBytes(5).toString('hex')}@example.test`, password: randomBytes(24).toString('base64url') };
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 1000, statement_timeout: 5000, lock_timeout: 1000 });
const outputPath = path.join(directory, 'owner-grant.json');
try {
  const input = { mode: 'create', request_id: randomUUID(), identity: owner.identity,
    external_actor_ref: 'isolated-browser-fixture-not-real-verification',
    evidence: { identity: evidence('synthetic owner identity'), authority: evidence('synthetic N1 authority') },
    expires_at: new Date(Date.now() + 48 * 3600000).toISOString(), name: 'Партнёрская программа Proofwall', public_slug: 'proofwall-pilot' };
  await bootstrapPilotOwner({ pool, input, identitySecret: Buffer.from(encoded, 'base64url'), outputPath });
  const handoff = JSON.parse(await readFile(outputPath, 'utf8'));
  await writeFile(path.join(directory, 'browser-fixture.json'), JSON.stringify({ owner, partner,
    grant_token: handoff.grant_token, program_id: handoff.program_id,
    invitation_evidence: { identity: evidence('synthetic partner identity'), authority: evidence('synthetic partner authorization') } }),
  { mode: 0o600, flag: 'wx' });
  console.log('PASS synthetic browser fixture prepared; private handoff is not printed');
} finally { await pool.end(); }
