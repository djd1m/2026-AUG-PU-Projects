import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { fixturePools, migrateFixture, newContext, resetOnboarding, owner, save, partner,
  register, evidence, count, waitForLock } from './onboarding-test-helpers';
import { bootstrapPilotOwner, type BootstrapInput } from '../../../scripts/bootstrap-pilot-owner';
import { hashGrantToken } from '../../../apps/web/src/lib/onboarding/identity';
import { OnboardingRepository } from '../src/onboarding-repository';
import type { WorkerTask, WorkerResult } from './onboarding-process-worker';

const pools = fixturePools(), ctx = newContext(pools);
const children = new Map<ChildProcess, Promise<{ code: number | null; signal: NodeJS.Signals | null }>>();
beforeAll(migrateFixture);
beforeEach(async () => {
  await resetOnboarding(pools.migrate);
  await pools.migrate.query('UPDATE n3a.admission_buckets SET count=0,window_start=clock_timestamp()');
});
afterEach(async () => {
  for (const child of children.keys()) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.all(children.values());
  children.clear();
});
afterAll(async () => { await resetOnboarding(pools.migrate); await pools.app.end(); await pools.migrate.end(); });

function startWorker(task: WorkerTask) {
  const child = fork(new URL('./onboarding-process-worker.ts', import.meta.url), [], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env,
  });
  let outputBytes = 0;
  child.stdout!.on('data', chunk => { outputBytes += chunk.length; });
  child.stderr!.on('data', chunk => { outputBytes += chunk.length; });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', () => resolve({ code: -1, signal: null }));
  });
  children.set(child, exited);
  const message = new Promise<WorkerResult>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('process_fixture_timeout')); }, 8000);
    const finish = (value: WorkerResult) => { clearTimeout(timeout); resolve(value); };
    child.once('message', value => finish(value as WorkerResult)); // Private typed test protocol, no production boundary.
    child.once('error', () => { clearTimeout(timeout); reject(new Error('process_fixture_unavailable')); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('process_exited_before_reply')); });
  });
  child.send(task);
  return { child, message, exited, outputBytes: () => outputBytes };
}
async function admissionWorker(sourceAttempts: number, identityAttempts: number, slot = 31) {
  const worker = startWorker({ kind: 'admission', sourceSlot: slot, identitySlot: slot,
    sourceAttempts, identityAttempts });
  const result = await worker.message;
  expect(await worker.exited).toEqual({ code: 0, signal: null });
  expect(worker.outputBytes()).toBe(0);
  if (result.kind !== 'admission') throw new Error('admission_worker_failed');
  return result;
}

it('separate processes share source/identity limits and replacement processes preserve durable windows', async () => {
  const initial = await Promise.all([admissionWorker(45, 8), admissionWorker(45, 8)]);
  expect(initial.reduce((n, x) => n + x.sourceAllowed, 0)).toBe(60);
  expect(initial.reduce((n, x) => n + x.identityAllowed, 0)).toBe(10);
  // Both initial processes have terminated. This new process has new JS state and database connections.
  expect(await admissionWorker(2, 2)).toEqual({ kind: 'admission', sourceAllowed: 0, identityAllowed: 0 });
  expect(await admissionWorker(1, 1, 32)).toEqual({ kind: 'admission', sourceAllowed: 1, identityAllowed: 1 });
  expect(await count(pools.migrate, 'admission_buckets')).toBe(8193);
  const counts = await pools.migrate.query("SELECT kind,count FROM n3a.admission_buckets WHERE kind='global' OR (slot=31 AND kind IN ('source','identity')) ORDER BY kind");
  expect(counts.rows).toEqual([{ kind: 'global', count: 61 }, { kind: 'identity', count: 10 }, { kind: 'source', count: 60 }]);
});

it('separate process source sets share the global300 ceiling and a restarted process stays denied', async () => {
  const results = await Promise.all([admissionWorker(180, 0, 100), admissionWorker(180, 0, 200)]);
  expect(results.reduce((n, result) => n + result.sourceAllowed, 0)).toBe(300);
  expect(await admissionWorker(1, 0, 300)).toEqual({ kind: 'admission', sourceAllowed: 0, identityAllowed: 0 });
  expect((await pools.migrate.query("SELECT count FROM n3a.admission_buckets WHERE kind='global'")).rows[0].count).toBe(300);
  expect(await count(pools.migrate, 'admission_buckets')).toBe(8193);
});

it('SIGKILL after real bootstrap COMMIT loses delivery only; retry does not mint and explicit reissue enrolls', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'n3a-bootstrap-crash-private-'));
  const outputPath = path.join(directory, 'grant.json');
  const input: BootstrapInput = { mode: 'create', request_id: randomUUID(), identity: 'crash-owner@pilot.example',
    external_actor_ref: 'fixture:crash-oracle', evidence, expires_at: new Date(Date.now() + 3600000).toISOString(),
    name: 'Crash oracle pilot', public_slug: 'crash-oracle-pilot' };
  const usersBefore = await count(pools.migrate, 'users'), sessionsBefore = await count(pools.migrate, 'sessions');
  const worker = startWorker({ kind: 'bootstrap-crash', input, identitySecret: ctx.identitySecret.toString('base64url'), outputPath });
  expect(await worker.message).toEqual({ kind: 'committed' });
  worker.child.kill('SIGKILL');
  expect(await worker.exited).toEqual({ code: null, signal: 'SIGKILL' });
  expect(worker.outputBytes()).toBe(0);
  expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  expect(await readFile(outputPath, 'utf8')).toBe('');
  expect(await count(pools.migrate, 'users')).toBe(usersBefore);
  expect(await count(pools.migrate, 'sessions')).toBe(sessionsBefore);
  const receipt = (await pools.migrate.query('SELECT program_id,owner_grant_id FROM n3a.bootstrap_receipts WHERE request_id=$1', [input.request_id])).rows[0];
  expect(receipt).toBeDefined();
  const replay = await bootstrapPilotOwner({ pool: pools.migrate, input, identitySecret: ctx.identitySecret, outputPath });
  expect(replay).toEqual({ program_id: receipt.program_id, grant_id: receipt.owner_grant_id, replayed: true });
  expect(await readFile(outputPath, 'utf8')).toBe('');
  expect(await count(pools.migrate, 'programs')).toBe(1);
  expect(await count(pools.migrate, 'enrollment_grants')).toBe(1);
  const replacementPath = path.join(directory, 'replacement.json');
  const replacement = await bootstrapPilotOwner({ pool: pools.migrate, input: { mode: 'reissue',
    request_id: randomUUID(), program_id: replay.program_id, previous_grant_id: replay.grant_id,
    identity: input.identity, external_actor_ref: 'fixture:recovery', evidence,
    expires_at: new Date(Date.now() + 3600000).toISOString() }, identitySecret: ctx.identitySecret, outputPath: replacementPath });
  const raw: unknown = JSON.parse(await readFile(replacementPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || !('grant_token' in raw) || typeof raw.grant_token !== 'string') throw new Error('replacement_handoff_missing');
  const account = await register(ctx, input.identity, raw.grant_token);
  await ctx.service.acceptEnrollment({ sessionTokenHash: account.sessionTokenHash, grant_token: raw.grant_token });
  expect(replacement.program_id).toBe(replay.program_id);
  expect((await pools.migrate.query('SELECT revoked_at IS NOT NULL AS revoked FROM n3a.enrollment_grants WHERE id=$1', [replay.grant_id])).rows[0].revoked).toBe(true);
  expect(await count(pools.migrate, 'bootstrap_receipts')).toBe(2);
  expect(await count(pools.migrate, 'memberships')).toBe(1);
});

it('issuer revocation and grant acceptance serialize in both orders with current replay authority', async () => {
  for (const first of ['revoke', 'accept']) {
    await resetOnboarding(pools.migrate);
    const o = await owner(ctx);
    const grant = await ctx.service.issueEnrollment({ ...o, role: 'operator', scopes: ['read'],
      identity: 'race-operator@pilot.example', evidence, expires_at: new Date(Date.now() + 3600000).toISOString() });
    const a = await register(ctx, 'race-operator@pilot.example', grant.grant_token);
    const authorization = { sessionTokenHash: a.sessionTokenHash, grantHash: hashGrantToken(grant.grant_token) };
    const app = new pg.Pool({ connectionString: pools.urls.app, application_name: 'onboarding-issuer-accept', max: 1 });
    const offline = new pg.Pool({ connectionString: pools.urls.migrate, application_name: 'onboarding-issuer-revoke', max: 1 });
    const client = await (first === 'revoke' ? offline : app).connect();
    let pending: Promise<unknown> | undefined;
    try {
      await client.query('BEGIN');
      if (first === 'revoke') {
        await client.query('SELECT id FROM n3a.programs WHERE id=$1 FOR UPDATE', [o.program_id]);
        await client.query("UPDATE n3a.memberships SET status='revoked' WHERE id=$1", [o.membership_id]);
        pending = new OnboardingRepository(app).acceptEnrollment(authorization).catch(error => error);
        await waitForLock(pools.app, 'onboarding-issuer-accept');
        await client.query('COMMIT');
        expect(await pending).toMatchObject({ code: 'enrollment_unavailable' });
        expect(await count(pools.migrate, 'memberships')).toBe(1);
        expect((await pools.migrate.query('SELECT consumed_at FROM n3a.enrollment_grants WHERE id=$1', [grant.grant_id])).rows[0].consumed_at).toBeNull();
      } else {
        await client.query('SELECT n3a.onboarding_accept($1,$2)', [authorization.sessionTokenHash, authorization.grantHash]);
        pending = (async () => {
          const revoker = await offline.connect();
          try {
            await revoker.query('BEGIN');
            await revoker.query('SELECT id FROM n3a.programs WHERE id=$1 FOR UPDATE', [o.program_id]);
            await revoker.query("UPDATE n3a.memberships SET status='revoked' WHERE id=$1", [o.membership_id]);
            await revoker.query('COMMIT');
          } finally { await revoker.query('ROLLBACK'); revoker.release(); }
        })().catch(error => error);
        await waitForLock(pools.migrate, 'onboarding-issuer-revoke');
        await client.query('COMMIT');
        expect(await pending).toBeUndefined();
        expect(await count(pools.migrate, 'memberships')).toBe(2);
        expect((await ctx.service.getProgram({ sessionTokenHash: a.sessionTokenHash, program_id: o.program_id })).role).toBe('operator');
      }
      await expect(ctx.service.acceptEnrollment({ sessionTokenHash: a.sessionTokenHash, grant_token: grant.grant_token })).rejects.toMatchObject({ code: 'enrollment_unavailable' });
    } finally {
      await client.query('ROLLBACK'); client.release();
      if (pending) await pending;
      await app.end(); await offline.end();
    }
  }
});

it('suspension and consumed invitation replay serialize in both orders without restoring membership or assets', async () => {
  for (const first of ['suspend', 'replay']) {
    await resetOnboarding(pools.migrate);
    const o = await owner(ctx); await save(ctx, o); const p = await partner(ctx, o);
    const accepted = await ctx.service.acceptPartner(p.acceptance);
    const facts = await count(pools.migrate, 'eligibility_facts');
    const actor = new pg.Pool({ connectionString: pools.urls.app, application_name: 'onboarding-transition-first', max: 1 });
    const waiter = new pg.Pool({ connectionString: pools.urls.app, application_name: 'onboarding-transition-second', max: 1 });
    const client = await actor.connect();
    const replayParams = [p.sessionTokenHash, hashGrantToken(p.grant_token), JSON.stringify({
      policy_id: p.acceptance.policy_id, terms_hash: p.acceptance.terms_hash, accepted: true })];
    const status = { ...o, partner_id: accepted.partner_id, status: 'suspended' as const, expected_status: 'active' as const };
    let pending: Promise<unknown> | undefined;
    try {
      await client.query('BEGIN');
      if (first === 'suspend') {
        await client.query('SELECT n3a.onboarding_partner_status($1,$2,$3,$4)', [o.sessionTokenHash, o.program_id,
          accepted.partner_id, JSON.stringify({ status: 'suspended', expected_status: 'active' })]);
        pending = new OnboardingRepository(waiter).acceptPartner({ ...p.acceptance, grantHash: hashGrantToken(p.grant_token) }).catch(error => error);
      } else {
        const replay = await client.query('SELECT n3a.onboarding_accept_partner($1,$2,$3) AS result', replayParams);
        expect(replay.rows[0].result).toEqual(accepted);
        pending = new OnboardingRepository(waiter).setPartnerStatus(status).catch(error => error);
      }
      await waitForLock(pools.app, 'onboarding-transition-second');
      await client.query('COMMIT');
      if (first === 'suspend') expect(await pending).toMatchObject({ code: 'enrollment_unavailable' });
      else expect(await pending).toEqual({ status: 'suspended' });
      await expect(ctx.service.acceptPartner(p.acceptance)).rejects.toMatchObject({ code: 'enrollment_unavailable' });
      expect(await count(pools.migrate, 'eligibility_facts')).toBe(facts + 1);
      expect(await count(pools.migrate, 'partner_assets')).toBe(2);
      expect((await pools.migrate.query('SELECT status,scopes FROM n3a.memberships WHERE id=$1', [accepted.membership_id])).rows[0]).toEqual({ status: 'revoked', scopes: ['read'] });
    } finally {
      await client.query('ROLLBACK'); client.release();
      if (pending) await pending;
      await actor.end(); await waiter.end();
    }
  }
});
