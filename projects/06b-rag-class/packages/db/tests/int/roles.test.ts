import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withService, withTenant } from '../../src/tenant';
import { ownerPool, seedTenant, servicePool, type Tenant, tenantPool } from './helpers';

// 08_review.md F-3: кабинет входит пользователем n6b_app_tenant, который состоит ТОЛЬКО в n6b_tenant, поэтому из его
// транзакции нельзя стать n6b_service (BYPASSRLS) — внедрение SQL в запрос кабинета не читает других арендаторов.
// F-4: колонка account.password_hash кабинету не выдана.
// Мутации (tests/artifacts/foundation/fix-mutations.txt): GRANT n6b_service TO n6b_app_tenant → красный;
// GRANT SELECT ON account TO n6b_tenant → красный.

const owner = ownerPool();
const tenant = tenantPool();
const svc = servicePool();
let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await seedTenant(owner);
  b = await seedTenant(owner);
});
afterAll(async () => { await owner.end(); await tenant.end(); await svc.end(); });

const membersOf = async (group: string) => (await owner.query<{ member: string }>(
  `SELECT m.rolname AS member FROM pg_auth_members am
   JOIN pg_roles g ON g.oid = am.roleid JOIN pg_roles m ON m.oid = am.member WHERE g.rolname = $1 ORDER BY 1`,
  [group])).rows.map((r) => r.member);

describe('две роли входа (F-3)', () => {
  it('членство: n6b_tenant ← только n6b_app_tenant, n6b_service ← только n6b_app_service', async () => {
    expect(await membersOf('n6b_tenant')).toEqual(['n6b_app_tenant']);
    expect(await membersOf('n6b_service')).toEqual(['n6b_app_service']);
  });

  it('из транзакции кабинета SET ROLE n6b_service → отказ', async () => {
    await expect(withTenant(tenant, a.accountId, (c) => c.query('SET LOCAL ROLE n6b_service')))
      .rejects.toThrow(/permission denied/);
    await expect(withTenant(tenant, a.accountId, (c) => c.query('SET LOCAL ROLE n6b_app_service')))
      .rejects.toThrow(/permission denied/);
  });

  it('внедрённый SQL в кабинете не читает хэш пароля и строки другого арендатора', async () => {
    // Сценарий валидатора: из транзакции A — SET ROLE n6b_service и чтение password_hash аккаунта B.
    await expect(withTenant(tenant, a.accountId, async (c) => {
      await c.query('SET LOCAL ROLE n6b_service');
      return c.query('SELECT password_hash FROM account WHERE id = $1', [b.accountId]);
    })).rejects.toThrow(/permission denied/);
  });

  it('пул кабинета не может открыть служебную транзакцию (withService на n6b_app_tenant → отказ)', async () => {
    await expect(withService(tenant, (c) => c.query('SELECT 1'))).rejects.toThrow(/permission denied/);
  });

  it('служебный пул не может стать ролью кабинета (роли не пересекаются в обе стороны)', async () => {
    await expect(withTenant(svc, a.accountId, (c) => c.query('SELECT 1'))).rejects.toThrow(/permission denied/);
  });

  it('служебный пул работает: BYPASSRLS только через SET LOCAL ROLE n6b_service', async () => {
    const n = await withService(svc, async (c) => (await c.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM account WHERE id = ANY($1)', [[a.accountId, b.accountId]])).rows[0]!.n);
    expect(n).toBe(2);
  });
});

describe('колонка password_hash закрыта для кабинета (F-4)', () => {
  it('каталог: у n6b_tenant нет права SELECT на account.password_hash', async () => {
    const r = await owner.query<{ allowed: boolean }>(
      "SELECT has_column_privilege('n6b_tenant', 'public.account', 'password_hash', 'SELECT') AS allowed");
    expect(r.rows[0]!.allowed).toBe(false);
  });

  it('кабинет: SELECT password_hash и SELECT * из account → отказ', async () => {
    await expect(withTenant(tenant, a.accountId, (c) => c.query('SELECT password_hash FROM account')))
      .rejects.toThrow(/permission denied/);
    await expect(withTenant(tenant, a.accountId, (c) => c.query('SELECT * FROM account')))
      .rejects.toThrow(/permission denied/);
  });

  it('кабинет читает разрешённые колонки своей строки', async () => {
    const rows = await withTenant(tenant, a.accountId, async (c) =>
      (await c.query<{ id: string; plan: string }>('SELECT id, email, kind, plan FROM account')).rows);
    expect(rows.map((r) => r.id)).toEqual([a.accountId]);
    expect(rows[0]!.plan).toBe('free');
  });
});
