import { afterAll, describe, expect, it } from 'vitest';
import { createStudioClient, type Pool } from '@n6b/db';
import { createStudioClientHandler } from '@/server/studio-handler';
import { ownerPool, servicePool } from '../../../../packages/db/tests/int/helpers';
import { BASE, post, seedActor, seedReferralBot, studioAuth, waitForLock } from './studio-fixture';

const owner = ownerPool();
const service = servicePool(10);
const auth = studioAuth(service);
const handler = createStudioClientHandler({ servicePool: service, publicBaseUrl: BASE,
  authenticate: (token) => auth.authenticate(token), log: () => undefined });
afterAll(async () => { await Promise.all([owner.end(), service.end()]); });
async function created(token: string, referral?: string, body?: unknown) {
  const response = await handler(post(token, body, referral ? { cookie: `n6b_session=${token}; n6b_ref=${referral}` } : {}));
  expect(response.status).toBe(201);
  return (await response.json()).data.account_id as string;
}

describe('STU-01/02 real PostgreSQL studio creation', () => {
  it('SC-US-013-1/2: eight concurrent creates produce exactly five clients with explicit safe defaults', async () => {
    const studio = await seedActor(owner, service);
    const responses = await Promise.all(Array.from({ length: 8 }, () => handler(post(studio.token,
      { kind: 'studio', plan: 'studio', parent_account_id: 'spoof', studio_access: false, password_hash: 'spoof' }))));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5);
    const caps = responses.filter((response) => response.status === 409);
    expect(caps).toHaveLength(3);
    for (const response of caps) expect((await response.json()).error.message).toBe('предел 5 клиентов в MVP');
    const rows = (await owner.query(`SELECT kind, plan, email, password_hash, studio_access, parent_account_id
      FROM account WHERE parent_account_id = $1`, [studio.accountId])).rows;
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toEqual({ kind: 'owner', plan: 'free', email: null, password_hash: null,
      studio_access: true, parent_account_id: studio.accountId });
    expect((await owner.query(`SELECT count(*)::int AS n FROM session s JOIN account a ON a.id = s.account_id
      WHERE a.parent_account_id = $1`, [studio.accountId])).rows[0].n).toBe(0);
    expect(await auth.authenticate(studio.token)).toBe(studio.accountId);
    // Cap counts attached children even if their studio access has been revoked.
    await owner.query('UPDATE account SET studio_access = false WHERE parent_account_id = $1', [studio.accountId]);
    expect((await handler(post(studio.token))).status).toBe(409);
  });
  it('SC-US-013-3: owner and child-studio sessions cannot create children or self-upgrade via body', async () => {
    const root = await seedActor(owner, service);
    for (const actor of [await seedActor(owner, service, 'owner'),
      await seedActor(owner, service, 'studio', root.accountId)]) {
      expect((await handler(post(actor.token, { kind: 'studio', parent_account_id: null, actor: root.accountId,
        plan: 'studio' }))).status).toBe(403);
      expect((await owner.query('SELECT id FROM account WHERE parent_account_id = $1', [actor.accountId])).rows).toEqual([]);
    }
    expect((await handler(post('invalid'))).status).toBe(401);
    expect((await handler(post(root.token, {}, { origin: 'https://foreign.test' }))).status).toBe(403);
  });
  it.each(['kind', 'parent'] as const)('STU-02: eligibility %s is rechecked after an actual lock wait', async (change) => {
    const studio = await seedActor(owner, service);
    const parent = await seedActor(owner, service);
    const modifier = await owner.connect();
    let pidReady!: (pid: number) => void;
    const pid = new Promise<number>((resolve) => { pidReady = resolve; });
    const observed = new Proxy(service, { get(target, key) {
      if (key === 'connect') return async () => {
        const client = await target.connect();
        pidReady((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        return client;
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } }) as Pool;
    let pending: ReturnType<typeof createStudioClient> | undefined;
    try {
      await modifier.query('BEGIN');
      if (change === 'kind') await modifier.query("UPDATE account SET kind = 'owner' WHERE id = $1", [studio.accountId]);
      else await modifier.query('UPDATE account SET parent_account_id = $2 WHERE id = $1', [studio.accountId, parent.accountId]);
      pending = createStudioClient(observed, studio.accountId, null);
      await waitForLock(owner, await pid);
      await modifier.query('COMMIT');
      expect(await pending).toBe('forbidden');
      expect((await owner.query('SELECT id FROM account WHERE parent_account_id = $1', [studio.accountId])).rows).toEqual([]);
    } finally { await modifier.query('ROLLBACK'); await pending?.catch(() => undefined); modifier.release(); }
  });
  it('STU-02: insertion failure rolls back; another studio is independent of a locked studio', async () => {
    const a = await seedActor(owner, service); const b = await seedActor(owner, service);
    const fault = new Proxy(service, { get(target, key) {
      if (key !== 'connect') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(c, k) {
          if (k === 'query') return (sql: string, args?: unknown[]) => {
            if (sql.startsWith('INSERT INTO account')) throw new Error('fixture child insertion failure');
            return c.query(sql, args);
          };
          const value = Reflect.get(c, k); return typeof value === 'function' ? value.bind(c) : value;
        } });
      };
    } }) as Pool;
    await expect(createStudioClient(fault, a.accountId, null)).rejects.toThrow('fixture child insertion failure');
    expect((await owner.query('SELECT id FROM account WHERE parent_account_id = $1', [a.accountId])).rows).toEqual([]);
    const blocker = await owner.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM account WHERE id = $1 FOR NO KEY UPDATE', [a.accountId]);
      expect(await createStudioClient(service, b.accountId, null)).toHaveProperty('accountId');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  });
});

describe('STU-06 SC-US-011-2 actual child creation referral wiring', () => {
  it('self/family sources excluded even without access; external attributed; body spoof and unknown ignored', async () => {
    const studio = await seedActor(owner, service);
    const self = await seedReferralBot(owner, studio.accountId);
    const family = await seedActor(owner, service, 'owner', studio.accountId);
    const childBot = await seedReferralBot(owner, family.accountId);
    await owner.query('UPDATE account SET studio_access = false WHERE id = $1', [family.accountId]);
    const outside = await seedActor(owner, service, 'studio');
    const outsideChild = await seedActor(owner, service, 'owner', outside.accountId);
    const external = await seedReferralBot(owner, outsideChild.accountId);
    for (const [ref, expected] of [[self.publicId, null], [childBot.publicId, null], [external.publicId, external.botId],
      ['Unknown_1234', null]] as const) {
      const child = await created(studio.token, ref, { ref: external.publicId, referred_by_bot_id: external.botId,
        actingStudioId: outside.accountId });
      expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [child])).rows[0].referred_by_bot_id)
        .toBe(expected);
    }
    const noCookieStudio = await seedActor(owner, service);
    const noCookie = await created(noCookieStudio.token, undefined, { ref: external.publicId, referred_by_bot_id: external.botId });
    expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [noCookie])).rows[0].referred_by_bot_id).toBeNull();
  });
});
