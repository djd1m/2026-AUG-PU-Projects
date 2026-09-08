import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplication } from '../../shared/application/index.mjs';
import { databaseConfig } from '../../shared/infrastructure/postgres.mjs';

export async function fixture(t, extra = {}) {
  // Missing PostgreSQL is a hard failure. These suites run inside the isolated backend test container.
  const schema = `n3_test_${randomUUID().replaceAll('-', '')}`;
  const database = { ...await databaseConfig(), options: `-c search_path=${schema},public` };
  const options = { database, schema, mode: 'fixture', ...extra };
  let app = await createApplication(options);
  const peers = [];
  t.after(async () => {
    await app.close(); for (const peer of peers) await peer.close();
    const pool = new pg.Pool(database);
    try { await pool.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await pool.end(); }
  });
  const session = await app.createDemo({ variant: 'A', role: 'merchant' });
  const context = role => ({ token: session.token, actorId: session.actors.find(a => a.role === role).id });
  const call = (action, input = {}, ctx = context('merchant'), key = randomUUID()) => app.execute(ctx, action, input, key);
  return { get app() { return app; }, session, database, schema, context, call,
    async restart() { await app.close(); app = await createApplication(options); return app; },
    async peer() { const peer = await createApplication(options); peers.push(peer); return peer; },
    async sql(query, values) { const pool = new pg.Pool(database); try { return await pool.query(query, values); } finally { await pool.end(); } },
  };
}
export const ref = artifact => ({ artifactId: artifact.artifactId, revision: artifact.revision, hash: artifact.hash });
export async function eventFor(f, overrides = {}) { return { ...(await f.call('dashboard')).fixtureEvents.payment, objectId: randomUUID(), ...overrides }; }
export async function refundFor(f, overrides = {}) { return { ...(await f.call('dashboard')).fixtureEvents.refund, objectId: randomUUID(), ...overrides }; }
export const code = expected => error => error.code === expected;
