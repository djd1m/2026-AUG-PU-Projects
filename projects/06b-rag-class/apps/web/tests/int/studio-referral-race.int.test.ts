import { afterAll, describe, expect, it } from 'vitest';
import { createStudioClient, type Pool } from '@n6b/db';
import { ownerPool, servicePool } from '../../../../packages/db/tests/int/helpers';
import { seedActor, seedReferralBot, waitForLock } from './studio-fixture';

const owner = ownerPool();
const service = servicePool();
afterAll(async () => { await Promise.all([owner.end(), service.end()]); });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
async function fixture(operation: 'detach' | 'attach') {
  const studio = await seedActor(owner, service);
  const source = await seedActor(owner, service, 'owner', operation === 'detach' ? studio.accountId : null);
  return { studio, source, bot: await seedReferralBot(owner, source.accountId),
    nextParent: operation === 'detach' ? null : studio.accountId };
}
async function attribution(result: Awaited<ReturnType<typeof createStudioClient>>) {
  expect(typeof result).toBe('object');
  if (typeof result !== 'object') throw new Error(`creation failed: ${result}`);
  return (await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [result.accountId])).rows[0].referred_by_bot_id;
}

describe('STU-06 real SQL family membership ordering through child commit', () => {
  it.each(['detach', 'attach'] as const)('membership %s commits BEFORE creation acquires account locks', async (operation) => {
    const { studio, source, bot, nextParent } = await fixture(operation);
    const modifier = await owner.connect();
    const creatorPid = deferred<number>();
    const observed = new Proxy(service, { get(target, key) {
      if (key === 'connect') return async () => {
        const client = await target.connect();
        await client.query("SET statement_timeout = '5s'");
        creatorPid.resolve((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        return client;
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } }) as Pool;
    let creation: ReturnType<typeof createStudioClient> | undefined;
    try {
      await modifier.query('BEGIN');
      await modifier.query('UPDATE account SET parent_account_id = $2 WHERE id = $1', [source.accountId, nextParent]);
      creation = createStudioClient(observed, studio.accountId, bot.publicId);
      await waitForLock(owner, await creatorPid.promise);
      await modifier.query('COMMIT');
      expect(await attribution(await creation)).toBe(operation === 'detach' ? bot.botId : null);
    } finally { await modifier.query('ROLLBACK'); await creation?.catch(() => undefined); modifier.release(); }
  });

  it.each(['detach', 'attach'] as const)('membership %s waits until AFTER account insertion commits', async (operation) => {
    const { studio, source, bot, nextParent } = await fixture(operation);
    const inserted = deferred<void>(); const release = deferred<void>();
    // Pause after a real SQL insertion, while the real creation transaction still owns its account locks.
    const paused = new Proxy(service, { get(target, key) {
      if (key !== 'connect') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(c, k) {
          if (k === 'query') return async (sql: string, args?: unknown[]) => {
            const result = await c.query(sql, args);
            if (sql.startsWith('INSERT INTO account')) { inserted.resolve(); await release.promise; }
            return result;
          };
          const value = Reflect.get(c, k); return typeof value === 'function' ? value.bind(c) : value;
        } });
      };
    } }) as Pool;
    const modifier = await owner.connect();
    const creation = createStudioClient(paused, studio.accountId, bot.publicId);
    // If creation itself fails, fail here rather than waiting forever for the test barrier.
    const ready = Promise.race([inserted.promise, creation.then(() => { throw new Error('creation missed insertion barrier'); })]);
    let change: Promise<unknown> | undefined;
    try {
      await ready;
      await modifier.query('BEGIN'); await modifier.query("SET LOCAL statement_timeout = '5s'");
      const pid = (await modifier.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      change = modifier.query('UPDATE account SET parent_account_id = $2 WHERE id = $1', [source.accountId, nextParent]);
      await waitForLock(owner, pid);
      release.resolve();
      expect(await attribution(await creation)).toBe(operation === 'detach' ? null : bot.botId);
      await change; await modifier.query('COMMIT');
      expect((await owner.query('SELECT parent_account_id FROM account WHERE id = $1', [source.accountId])).rows[0].parent_account_id)
        .toBe(nextParent);
    } finally {
      release.resolve(); await creation.catch(() => undefined); await change?.catch(() => undefined);
      await modifier.query('ROLLBACK'); modifier.release();
    }
  });

  it('reciprocal cross-studio referrals lock both account rows in UUID order without deadlock', async () => {
    const a = await seedActor(owner, service); const b = await seedActor(owner, service);
    const aBot = await seedReferralBot(owner, a.accountId); const bBot = await seedReferralBot(owner, b.accountId);
    const results = await Promise.all([createStudioClient(service, a.accountId, bBot.publicId),
      createStudioClient(service, b.accountId, aBot.publicId)]);
    expect(await attribution(results[0]!)).toBe(bBot.botId);
    expect(await attribution(results[1]!)).toBe(aBot.botId);
  });
});
