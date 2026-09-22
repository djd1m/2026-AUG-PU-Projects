import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
const dbUrl = process.env.DATABASE_URL;
describe.skipIf(!dbUrl)('RU-007 upgrade', () => {
  it('legacy IPv6 /24 is removed before unchanged 004; IPv4 survives; rerun works', async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Only *_test');
    await ensureTestDatabase(dbUrl);
    const schema = `upgrade_${randomBytes(8).toString('hex')}`;
    const pool = new Pool({ connectionString: dbUrl, options: `-c search_path=${schema},public` });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'n5-old-migrations-'));
    try {
      for (const name of await readdir('packages/db/migrations')) {
        if (name < '004' && !name.includes('legacy_cleanup')) await copyFile(`packages/db/migrations/${name}`, path.join(directory, name));
      }
      await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool, directory);
      const id = (await pool.query("INSERT INTO account(email,password_hash) VALUES ('legacy@test.invalid','hash') RETURNING id")).rows[0].id;
      for (const [prefix, token] of [['2001:d00::/24', 'v6'], ['192.0.2.0/24', 'v4']]) {
        await pool.query("INSERT INTO session(account_id,cookie_token_hash,ip_prefix,expires_at) VALUES ($1,$2,$3,now()+interval '1 day')", [id, token, prefix]);
        await pool.query("INSERT INTO growth_event(type,ip_prefix,day) VALUES ('download',$1,current_date)", [prefix]);
      }
      await migrate(pool); await migrate(pool);
      expect((await pool.query('SELECT cookie_token_hash FROM session')).rows).toEqual([{ cookie_token_hash: 'v4' }]);
      expect((await pool.query('SELECT ip_prefix::text AS ip FROM growth_event')).rows).toEqual([{ ip: '192.0.2.0/24' }]);
      await pool.query("INSERT INTO session(account_id,cookie_token_hash,ip_prefix,expires_at) VALUES ($1,'new-v6','2001:db8::/64',now()+interval '1 day')", [id]);
    } finally { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); await rm(directory, { recursive: true, force: true }); }
  });
});
