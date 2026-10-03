import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { acceptHandover, createStudioClient, issueHandover } from '@n6b/db';
import { PgAuthStore } from '@/server/auth-store';
import { ownerPool, servicePool, uniq } from '../../../../packages/db/tests/int/helpers';
import { seedActor, seedReferralBot, waitForLock } from './studio-fixture';
import { bounded, claimed, deferred, digest, expireAfterWait, fixture, material, observePool, snapshot } from './handover-fixture';

const owner = ownerPool(); const service = servicePool(10);
afterAll(async () => { await Promise.all([owner.end(), service.end()]); });
async function attribution(result: Awaited<ReturnType<typeof createStudioClient>>) {
  if (typeof result !== 'object') throw new Error(`create failed ${result}`);
  return (await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [result.accountId])).rows[0].referred_by_bot_id;
}
async function orderedFixture(order: 'child-first' | 'parent-first') {
  const studio = await seedActor(owner, service);
  const childId = randomUUID().replace(/^[0-9a-f]{8}/, order === 'child-first' ? '00000000' : 'ffffffff');
  expect(childId < studio.accountId).toBe(order === 'child-first');
  await owner.query("INSERT INTO account(id,kind,parent_account_id,studio_access) VALUES($1,'owner',$2,true)", [childId, studio.accountId]);
  const token = randomBytes(32).toString('base64url'); const input = material(undefined, false, token);
  expect(await issueHandover(service, studio.accountId, childId, input.tokenHash)).not.toBe('forbidden');
  return { studio, childId, token, input };
}

describe('HAN-06 real PG handover races and blocking clocks', () => {
  it.each(['same-token', 'different-token'] as const)('HAN-04/06 %s: exactly one winner, no overwrite or extra session', async (kind) => {
    const f = await fixture(owner, service); f.input.keepStudioAccess = true;
    const second = material(undefined, true); if (kind === 'same-token') second.tokenHash = f.input.tokenHash;
    else expect(await issueHandover(service, f.studio.accountId, f.childId, second.tokenHash)).not.toBe('forbidden');
    const pids: number[] = []; const ready = deferred<number[]>();
    const pool = observePool(service, { pid: (pid) => { pids.push(pid); if (pids.length === 2) ready.resolve(pids); } });
    const holder = await owner.connect(); let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN'); await holder.query('SELECT id FROM account WHERE id=$1 FOR NO KEY UPDATE', [f.childId]);
      const a = acceptHandover(pool, f.input); const b = acceptHandover(pool, second);
      pending = Promise.all([a, b]);
      for (const pid of await bounded(ready.promise)) await waitForLock(owner, pid);
      await holder.query('COMMIT');
      const results = await Promise.all([a, b]); expect(results.filter((r) => typeof r === 'object')).toHaveLength(1);
      expect(results.filter((r) => r === 'gone')).toHaveLength(1);
      const winner = typeof results[0] === 'object' ? f.input : second;
      const s = await claimed(owner, f.childId, results.find((r) => typeof r === 'object')!, winner);
      expect(s.tokens.filter((t) => t.used_at !== null)).toHaveLength(1);
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); holder.release(); }
  });
  it('SC-US-014-4 same-email/two-child unique-index race: loser intact and retry succeeds', async () => {
    const a = await fixture(owner, service); const b = await fixture(owner, service); b.input.email = a.input.email;
    const beforeB = await snapshot(owner, b.childId);
    const inserted = deferred(); const release = deferred(); const loserPid = deferred<number>();
    const paused = observePool(service, { query: async (c, sql, args) => {
      const r = await c.query(sql, args); if (sql.startsWith('UPDATE account')) { inserted.resolve(); await bounded(release.promise); } return r;
    } });
    const winner = acceptHandover(paused, a.input); let loser: ReturnType<typeof acceptHandover> | undefined;
    try {
      await bounded(Promise.race([inserted.promise, winner.then(() => { throw new Error('missed update barrier'); })]));
      loser = acceptHandover(observePool(service, { pid: loserPid.resolve }), b.input);
      await waitForLock(owner, await bounded(loserPid.promise)); release.resolve();
      expect(await winner).toEqual({ accountId: a.childId }); expect(await loser).toBe('email-taken');
      expect(await snapshot(owner, b.childId)).toEqual(beforeB);
      expect((await owner.query('SELECT id FROM account WHERE lower(email) = $1', [a.input.email])).rows).toHaveLength(1);
      b.input.email = `${uniq('retry')}@example.test`; expect(await acceptHandover(service, b.input)).toEqual({ accountId: b.childId });
    } finally { release.resolve(); await winner.catch(() => undefined); await loser?.catch(() => undefined); }
  });
  it('SC-US-014-4 actual PgAuthStore registration races with handover without partial changes', async () => {
    const f = await fixture(owner, service); const before = await snapshot(owner, f.childId);
    const inserted = deferred(); const release = deferred(); const pid = deferred<number>();
    const registrationPool = observePool(service, { query: async (c, sql, args) => {
      const r = await c.query(sql, args);
      if (sql.startsWith('WITH registered AS')) { inserted.resolve(); await bounded(release.promise); }
      return r;
    } });
    const registration = new PgAuthStore(registrationPool).register(f.input.email, 'registered', 'owner',
      { tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000) });
    let pending: ReturnType<typeof acceptHandover> | undefined;
    try {
      await bounded(Promise.race([inserted.promise, registration.then(() => { throw new Error('missing registration barrier'); })]));
      pending = acceptHandover(observePool(service, { pid: pid.resolve }), f.input);
      await waitForLock(owner, await bounded(pid.promise)); release.resolve();
      expect(await registration).toBe(true); expect(await pending).toBe('email-taken');
      expect(await snapshot(owner, f.childId)).toEqual(before);
    } finally { release.resolve(); await registration.catch(() => undefined); await pending?.catch(() => undefined); }
  });
  it.each(['claimed', 'revoked'] as const)('HAN-01 issue rechecks %s child after real account lock wait', async (change) => {
    const f = await fixture(owner, service); const holder = await owner.connect(); const pid = deferred<number>();
    const candidate = material(); let pending: ReturnType<typeof issueHandover> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query(change === 'claimed' ? "UPDATE account SET password_hash='claimed' WHERE id=$1"
        : 'UPDATE account SET studio_access=false WHERE id=$1', [f.childId]);
      pending = issueHandover(observePool(service, { pid: pid.resolve }), f.studio.accountId, f.childId, candidate.tokenHash);
      await waitForLock(owner, await bounded(pid.promise)); await holder.query('COMMIT');
      const before = await snapshot(owner, f.childId); expect(await pending).toBe('forbidden');
      expect(await snapshot(owner, f.childId)).toEqual(before);
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); holder.release(); }
  });
  it.each(['account', 'token', 'email', 'session'] as const)('HAN-06 expiry during %s wait rolls back all writes', async (wait) => {
    const f = await fixture(owner, service);
    await owner.query("UPDATE handover_token SET expires_at=clock_timestamp()+interval '1 second' WHERE token_hash=$1", [f.input.tokenHash]);
    const before = await snapshot(owner, f.childId); const holder = await owner.connect(); const pid = deferred<number>();
    let pending: ReturnType<typeof acceptHandover> | undefined;
    try {
      await holder.query('BEGIN');
      if (wait === 'account') await holder.query('SELECT id FROM account WHERE id=$1 FOR NO KEY UPDATE', [f.childId]);
      if (wait === 'token') await holder.query('SELECT id FROM handover_token WHERE token_hash=$1 FOR UPDATE', [f.input.tokenHash]);
      if (wait === 'email') await holder.query('INSERT INTO account(email) VALUES($1)', [f.input.email]);
      if (wait === 'session') await holder.query('INSERT INTO session(account_id,token_hash,expires_at) VALUES($1,$2,$3)',
        [f.studio.accountId, f.input.session.tokenHash, f.input.session.expiresAt]);
      pending = acceptHandover(observePool(service, { pid: pid.resolve }), f.input);
      await waitForLock(owner, await bounded(pid.promise)); await expireAfterWait(owner, f.input.tokenHash);
      await holder.query('ROLLBACK'); expect(await pending).toBe('gone');
      expect(await snapshot(owner, f.childId)).toEqual(before);
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); holder.release(); }
  });
  it.each(['account', 'token', 'email'] as const)('HAN-06 still-valid after %s lock wait succeeds', async (wait) => {
    const f = await fixture(owner, service); const holder = await owner.connect(); const pid = deferred<number>();
    let pending: ReturnType<typeof acceptHandover> | undefined;
    try {
      await holder.query('BEGIN');
      if (wait === 'account') await holder.query('SELECT id FROM account WHERE id=$1 FOR NO KEY UPDATE', [f.childId]);
      if (wait === 'token') await holder.query('SELECT id FROM handover_token WHERE token_hash=$1 FOR UPDATE', [f.input.tokenHash]);
      if (wait === 'email') await holder.query('INSERT INTO account(email) VALUES($1)', [f.input.email]);
      pending = acceptHandover(observePool(service, { pid: pid.resolve }), f.input);
      await waitForLock(owner, await bounded(pid.promise)); await holder.query('ROLLBACK');
      expect(await pending).toEqual({ accountId: f.childId });
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); holder.release(); }
  });
  it.each(['issue-first', 'accept-first'] as const)('HAN-06 issue versus keep=true accept ordered %s', async (order) => {
    const f = await fixture(owner, service); f.input.keepStudioAccess = true;
    const paused = deferred(); const release = deferred(); const pid = deferred<number>();
    const gate = observePool(service, { query: async (c, sql, args) => {
      const r = await c.query(sql, args);
      if (sql.startsWith(order === 'issue-first' ? 'INSERT INTO handover_token' : 'UPDATE account')) {
        paused.resolve(); await bounded(release.promise);
      } return r;
    } });
    const second = material(); const first = order === 'issue-first'
      ? issueHandover(gate, f.studio.accountId, f.childId, second.tokenHash) : acceptHandover(gate, f.input);
    let other: Promise<unknown> | undefined;
    try {
      await bounded(Promise.race([paused.promise, first.then(() => { throw new Error('missed first barrier'); })]));
      const observed = observePool(service, { pid: pid.resolve });
      other = order === 'issue-first' ? acceptHandover(observed, f.input)
        : issueHandover(observed, f.studio.accountId, f.childId, second.tokenHash);
      await waitForLock(owner, await bounded(pid.promise)); release.resolve(); await first;
      const result = await other; expect(result).toEqual(order === 'issue-first' ? { accountId: f.childId } : 'forbidden');
      const before = await snapshot(owner, f.childId);
      expect(await acceptHandover(service, second)).toBe(order === 'issue-first' ? 'gone' : 'missing');
      expect(await snapshot(owner, f.childId)).toEqual(before);
    } finally { release.resolve(); await first.catch(() => undefined); await other?.catch(() => undefined); }
  });
  it.each([false, true])('HAN-06 real detach/keep versus cap5, keep=%s', async (keep) => {
    const f = await fixture(owner, service); f.input.keepStudioAccess = keep;
    for (let i = 0; i < 4; i++) expect(typeof await createStudioClient(service, f.studio.accountId, null)).toBe('object');
    const paused = deferred(); const release = deferred(); const pid = deferred<number>();
    const gate = observePool(service, { query: async (c, sql, args) => {
      const r = await c.query(sql, args); if (sql.startsWith('UPDATE account')) { paused.resolve(); await bounded(release.promise); } return r;
    } });
    const claim = acceptHandover(gate, f.input); let creation: ReturnType<typeof createStudioClient> | undefined;
    try {
      await bounded(Promise.race([paused.promise, claim.then(() => { throw new Error('missing cap barrier'); })]));
      creation = createStudioClient(observePool(service, { pid: pid.resolve }), f.studio.accountId, null);
      await waitForLock(owner, await bounded(pid.promise));
      expect((await owner.query('SELECT count(*)::int AS n FROM account WHERE parent_account_id=$1', [f.studio.accountId])).rows[0].n).toBe(5);
      release.resolve(); expect(await claim).toEqual({ accountId: f.childId });
      const r = await creation; expect(keep ? r === 'cap' : typeof r === 'object').toBe(true);
      expect((await owner.query('SELECT count(*)::int AS n FROM account WHERE parent_account_id=$1', [f.studio.accountId])).rows[0].n).toBe(5);
      expect(await createStudioClient(service, f.studio.accountId, null)).toBe('cap');
    } finally { release.resolve(); await claim.catch(() => undefined); await creation?.catch(() => undefined); }
  });
});

describe('HAN-06 actual F14 versus F13 family classification', () => {
  it.each(['child-first', 'parent-first'] as const)('detach/keep commits BEFORE F13 classification, UUID order=%s', async (order) => {
    for (const keep of [false, true]) {
      const f = await orderedFixture(order); f.input.keepStudioAccess = keep;
      const bot = await seedReferralBot(owner, f.childId);
      const updated = deferred(); const release = deferred(); const pid = deferred<number>();
      const paused = observePool(service, { query: async (c, sql, args) => {
        const r = await c.query(sql, args); if (sql.startsWith('UPDATE account')) { updated.resolve(); await bounded(release.promise); } return r;
      } });
      const claim = acceptHandover(paused, f.input); let creation: ReturnType<typeof createStudioClient> | undefined;
      try {
        await bounded(Promise.race([updated.promise, claim.then(() => { throw new Error('missing family update barrier'); })]));
        creation = createStudioClient(observePool(service, { pid: pid.resolve }), f.studio.accountId, bot.publicId);
        await waitForLock(owner, await bounded(pid.promise)); release.resolve();
        expect(await claim).toEqual({ accountId: f.childId });
        expect(await attribution(await creation)).toBe(keep ? null : bot.botId);
      } finally { release.resolve(); await claim.catch(() => undefined); await creation?.catch(() => undefined); }
    }
  });
  it.each(['child-first', 'parent-first'] as const)('F13 insertion locks membership THROUGH COMMIT before real F14, UUID order=%s', async (order) => {
    for (const keep of [false, true]) {
      const f = await orderedFixture(order); f.input.keepStudioAccess = keep;
      const bot = await seedReferralBot(owner, f.childId); const inserted = deferred(); const release = deferred(); const pid = deferred<number>();
      const paused = observePool(service, { query: async (c, sql, args) => {
        const r = await c.query(sql, args); if (sql.startsWith('INSERT INTO account')) { inserted.resolve(); await bounded(release.promise); } return r;
      } });
      const creation = createStudioClient(paused, f.studio.accountId, bot.publicId); let claim: ReturnType<typeof acceptHandover> | undefined;
      try {
        await bounded(Promise.race([inserted.promise, creation.then(() => { throw new Error('missing family insert barrier'); })]));
        claim = acceptHandover(observePool(service, { pid: pid.resolve }), f.input);
        await waitForLock(owner, await bounded(pid.promise)); release.resolve();
        expect(await attribution(await creation)).toBeNull(); expect(await claim).toEqual({ accountId: f.childId });
        expect((await snapshot(owner, f.childId)).account[0].parent_account_id).toBe(keep ? f.studio.accountId : null);
      } finally { release.resolve(); await creation.catch(() => undefined); await claim?.catch(() => undefined); }
    }
  });
});
