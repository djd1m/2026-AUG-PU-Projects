// Права ролей (AC-foundation-5): приложение НЕ владеет схемой.
//
// Проверяется запросом из-под самой роли, а не чтением грантов: компрометация приложения
// не должна давать права переписать схему, и «мы выдали правильные гранты» — это
// утверждение о намерении, а не о результате.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { appDatabaseUrl, migratedPool, truncateAll } from '../helpers/db.js';
import type { DbPool } from '@n4/db';

let pool: DbPool;
let app: pg.Client;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-roles');
  await truncateAll(pool);
  app = new pg.Client({ connectionString: appDatabaseUrl(), application_name: 'n4-tests-app-role' });
  await app.connect();
}, 60_000);

afterAll(async () => {
  await app.end();
  await pool.end();
});

describe('роли базы', () => {
  it('роль приложения не может менять схему но выполняет DML', async () => {
    // DDL — отвергается ПРАВАМИ, а не кодом приложения.
    await expect(app.query('DROP TABLE recognition')).rejects.toMatchObject({ code: '42501' });
    await expect(app.query('ALTER TABLE recognition ADD COLUMN x int')).rejects.toMatchObject({ code: '42501' });
    await expect(app.query('CREATE TABLE t (id int)')).rejects.toMatchObject({ code: '42501' });

    // DML — выполняется.
    const session = await app.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
       VALUES ('hash-role-test', '203.0.113.0/24', now() + interval '7 days') RETURNING id`,
    );
    const id = session.rows[0]?.id;
    expect(id).toBeDefined();
    const selected = await app.query('SELECT id FROM device_session WHERE id = $1', [id]);
    expect(selected.rowCount).toBe(1);
    await app.query('UPDATE device_session SET last_seen_at = now() WHERE id = $1', [id]);
    const deleted = await app.query('DELETE FROM device_session WHERE id = $1', [id]);
    expect(deleted.rowCount).toBe(1);

    // Те же DDL из-под владельца схемы выполняются: дело в правах, а не в сломанной базе.
    await pool.query('SET ROLE n4_migrate');
    await pool.query('CREATE TABLE n4_role_probe (id int)');
    await pool.query('DROP TABLE n4_role_probe');
    await pool.query('RESET ROLE');
  });
});
