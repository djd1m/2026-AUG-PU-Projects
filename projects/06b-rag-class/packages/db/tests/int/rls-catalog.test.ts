import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../../src/tenant';
import { ownerPool, seedTenant, type Tenant, tenantPool } from './helpers';

// 08_review.md F-2: изоляция арендаторов на КАЖДОЙ таблице с account_id. Перечень берётся из pg_catalog, а не
// списком руками: новая таблица с account_id без политики, без FORCE или без строк в seedTenant роняет этот тест.
// Мутация (tests/artifacts/foundation/fix-mutations.txt): USING (true) на source_file и question_log → красный.

interface TableInfo {
  relname: string;
  key: string; // колонка владельца строки: account_id, а у самой account — id
  rls: boolean;
  force: boolean;
  tenantAny: boolean; // у n6b_tenant есть хоть какое-то право хоть на одну колонку
  tenantInsert: boolean;
  tenantUpdate: boolean;
  tenantDelete: boolean;
  tenantPolicies: number;
}

const owner = ownerPool();
const tenant = tenantPool();
let a: Tenant;
let b: Tenant;
let tables: TableInfo[] = [];

beforeAll(async () => {
  a = await seedTenant(owner);
  b = await seedTenant(owner);
  tables = (await owner.query<TableInfo>(`
    SELECT c.relname,
           CASE WHEN c.relname = 'account' THEN 'id' ELSE 'account_id' END AS key,
           c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
           (has_any_column_privilege('n6b_tenant', c.oid, 'SELECT')
             OR has_any_column_privilege('n6b_tenant', c.oid, 'INSERT')
             OR has_any_column_privilege('n6b_tenant', c.oid, 'UPDATE')
             OR has_table_privilege('n6b_tenant', c.oid, 'DELETE')) AS "tenantAny",
           has_table_privilege('n6b_tenant', c.oid, 'INSERT') AS "tenantInsert",
           has_table_privilege('n6b_tenant', c.oid, 'UPDATE') AS "tenantUpdate",
           has_table_privilege('n6b_tenant', c.oid, 'DELETE') AS "tenantDelete",
           (SELECT count(*)::int FROM pg_policy p
             WHERE p.polrelid = c.oid AND 'n6b_tenant'::regrole = ANY (p.polroles)) AS "tenantPolicies"
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'schema_migrations'
      AND (c.relname = 'account' OR EXISTS (SELECT 1 FROM pg_attribute x
            WHERE x.attrelid = c.oid AND x.attname = 'account_id' AND NOT x.attisdropped))
    ORDER BY c.relname`)).rows;
});
afterAll(async () => { await owner.end(); await tenant.end(); });

const cabinet = () => tables.filter((t) => t.tenantAny);

describe('RLS по перечню из pg_catalog (F-2)', () => {
  it('перечень не пуст и содержит известные таблицы кабинета (страж запроса к каталогу)', () => {
    const names = tables.map((t) => t.relname);
    for (const known of ['account', 'bot', 'source', 'source_file', 'document', 'chunk', 'index_job', 'question_log',
      'growth_event', 'handover_token', 'session', 'model_call_log', 'operator']) expect(names).toContain(known);
  });

  it('каждая таблица с account_id: RLS включена и FORCE', () => {
    expect(tables.filter((t) => !t.rls || !t.force).map((t) => t.relname)).toEqual([]);
  });

  it('каждая таблица, выданная кабинету, имеет политику для n6b_tenant', () => {
    expect(cabinet().filter((t) => t.tenantPolicies === 0).map((t) => t.relname)).toEqual([]);
  });

  it('кабинету не выдана ни одна таблица без владельца строки (account_id)', async () => {
    const r = await owner.query<{ relname: string }>(`
      SELECT c.relname FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'account'
        AND (has_any_column_privilege('n6b_tenant', c.oid, 'SELECT') OR has_table_privilege('n6b_tenant', c.oid, 'INSERT'))
        AND NOT EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.oid AND x.attname = 'account_id'
                        AND NOT x.attisdropped)`);
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it('чтение: на каждой таблице кабинета A видит свои строки и ни одной строки B', async () => {
    const leaks: string[] = [];
    for (const t of cabinet()) {
      const [own, foreign] = await withTenant(tenant, a.accountId, async (c) => {
        const q = (id: string) => c.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t.relname} WHERE ${t.key} = $1`, [id]);
        return [(await q(a.accountId)).rows[0]!.n, (await q(b.accountId)).rows[0]!.n];
      });
      if (own === 0) leaks.push(`${t.relname}: своих строк 0 (нет политики или нет строки в seedTenant)`);
      if (foreign !== 0) leaks.push(`${t.relname}: видно строк B — ${foreign}`);
    }
    expect(leaks).toEqual([]);
  });

  it('запись: вставка строки с account_id B отвергается WITH CHECK на каждой таблице с INSERT', async () => {
    const accepted: string[] = [];
    for (const t of cabinet().filter((x) => x.tenantInsert)) {
      const row = (await owner.query<{ r: Record<string, unknown> }>(
        `SELECT row_to_json(x) AS r FROM ${t.relname} x WHERE ${t.key} = $1 LIMIT 1`, [a.accountId])).rows[0]!.r;
      const forged = { ...row, id: randomUUID(), [t.key]: b.accountId };
      const outcome = await withTenant(tenant, a.accountId, (c) => c.query(
        `INSERT INTO ${t.relname} SELECT * FROM json_populate_record(NULL::${t.relname}, $1)`, [JSON.stringify(forged)]))
        .then(() => 'accepted', (e: Error) => e.message);
      if (!/row-level security/.test(outcome)) accepted.push(`${t.relname}: ${outcome}`);
    }
    expect(accepted).toEqual([]);
  });

  it('изменение и удаление строк B не затрагивают ни одной строки; перенос своей строки к B отвергается', async () => {
    const touched: string[] = [];
    for (const t of cabinet()) {
      await withTenant(tenant, a.accountId, async (c) => {
        if (t.tenantUpdate) {
          const u = await c.query(`UPDATE ${t.relname} SET ${t.key} = ${t.key} WHERE ${t.key} = $1`, [b.accountId]);
          if ((u.rowCount ?? 0) !== 0) touched.push(`${t.relname}: UPDATE ${u.rowCount}`);
        }
        if (t.tenantDelete) {
          const d = await c.query(`DELETE FROM ${t.relname} WHERE ${t.key} = $1`, [b.accountId]);
          if ((d.rowCount ?? 0) !== 0) touched.push(`${t.relname}: DELETE ${d.rowCount}`);
        }
      });
      if (t.tenantUpdate) {
        const moved = await withTenant(tenant, a.accountId, (c) => c.query(
          `UPDATE ${t.relname} SET ${t.key} = $2 WHERE ${t.key} = $1`, [a.accountId, b.accountId]))
          .then(() => 'accepted', (e: Error) => e.message);
        if (!/row-level security|foreign key/.test(moved)) touched.push(`${t.relname}: перенос к B — ${moved}`);
      }
    }
    expect(touched).toEqual([]);
  });

  it('таблицы с account_id, не выданные кабинету, недоступны ему целиком', async () => {
    const closed = tables.filter((t) => !t.tenantAny).map((t) => t.relname);
    expect(closed.length).toBeGreaterThan(0);
    for (const name of closed) {
      await expect(withTenant(tenant, a.accountId, (c) => c.query(`SELECT 1 FROM ${name} LIMIT 1`)), name)
        .rejects.toThrow(/permission denied/);
    }
  });
});
