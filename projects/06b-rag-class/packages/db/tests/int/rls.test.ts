import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withService, withTenant } from '../../src/tenant';
import { ownerPool, seedTenant, servicePool, type Tenant, tenantPool, vector } from './helpers';

// NFR-n6b-3: RLS по account_id. Проверяется под пользователями входа n6b_app_tenant / n6b_app_service (как в проде),
// не под владельцем БД. Полный перечень таблиц с account_id — rls-catalog.test.ts (из pg_catalog, не списком руками).
const TENANT_TABLES = ['bot', 'source', 'source_file', 'document', 'chunk', 'index_job', 'question_log',
  'growth_event', 'handover_token'];
const ALL_TABLES = ['account', 'session', ...TENANT_TABLES, 'model_call_log', 'quota_counter', 'widget_install',
  'badge_event', 'operator'];

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

const count = (table: string, accountId: string, as: string) =>
  withTenant(tenant, as, async (c) => Number((await c.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE account_id = $1`, [accountId])).rows[0].n));

describe('схема и pgvector (ADR-002)', () => {
  it('все 16 таблиц существуют, RLS включена и FORCE на каждой', async () => {
    const r = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname = ANY($1)`, [ALL_TABLES]);
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...ALL_TABLES].sort());
    expect(r.rows.filter((x) => !x.relrowsecurity || !x.relforcerowsecurity).map((x) => x.relname)).toEqual([]);
  });

  it('pgvector 0.8.x, HNSW vector_cosine_ops на chunk.embedding, размерность 1536 обязательна', async () => {
    const v = await owner.query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    expect(v.rows[0]?.extversion).toMatch(/^0\.8\./);
    const idx = await owner.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'chunk_embedding_hnsw'");
    expect(idx.rows[0]?.indexdef).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
    await expect(owner.query(`INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
      VALUES ($1, $2, $3, 1, 't', 'h2', 1, '[1,2,3]')`, [a.documentId, a.botId, a.accountId])).rejects.toThrow(/dimensions/);
  });

  it('закрытые множества держит CHECK; одна живая задача на источник', async () => {
    await expect(owner.query("UPDATE index_job SET state = 'paused' WHERE id = $1", [a.jobId])).rejects.toThrow(/check/i);
    await expect(owner.query('INSERT INTO index_job (source_id, account_id) VALUES ($1, $2)', [a.sourceId, a.accountId]))
      .rejects.toThrow(/index_job_live_source_key/);
  });

  it('подаккаунт — один уровень: родитель обязан быть студией верхнего уровня', async () => {
    const plain = await seedTenant(owner);
    await expect(seedTenant(owner, { parent: plain.accountId, email: null })).rejects.toThrow(/студией/);
  });
});

describe('RLS: изоляция арендаторов под пользователем кабинета n6b_app_tenant', () => {
  it('SELECT без фильтра возвращает только строки своего аккаунта', async () => {
    const ids = await withTenant(tenant, a.accountId, async (c) =>
      (await c.query<{ account_id: string }>('SELECT DISTINCT account_id FROM bot')).rows.map((r) => r.account_id));
    expect(ids).toEqual([a.accountId]);
  });

  it('чужой bot_id по прямому id не находится (→ 404 в API, существование не раскрыто)', async () => {
    const rows = await withTenant(tenant, a.accountId, async (c) =>
      (await c.query('SELECT id FROM bot WHERE id = $1', [b.botId])).rows);
    expect(rows).toEqual([]);
  });

  it('запись строки с чужим account_id отвергается WITH CHECK', async () => {
    await expect(withTenant(tenant, a.accountId, (c) => c.query(
      `INSERT INTO bot (account_id, public_id, name) VALUES ($1, 'AAAAAAAAAAAA', 'x')`, [b.accountId])))
      .rejects.toThrow(/row-level security/);
  });

  it('UPDATE и DELETE чужих строк не затрагивают ни одной строки', async () => {
    const touched = await withTenant(tenant, a.accountId, async (c) => {
      const u = await c.query("UPDATE bot SET name = 'pwned' WHERE id = $1", [b.botId]);
      const d = await c.query('DELETE FROM chunk WHERE id = $1', [b.chunkId]);
      return (u.rowCount ?? 0) + (d.rowCount ?? 0);
    });
    expect(touched).toBe(0);
    expect((await owner.query('SELECT name FROM bot WHERE id = $1', [b.botId])).rows[0].name).toBe('bot');
  });

  it('роль кабинета без контекста аккаунта не видит ничего', async () => {
    const client = await tenant.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE n6b_tenant');
      expect((await client.query('SELECT count(*)::int AS n FROM bot')).rows[0].n).toBe(0);
      await client.query("SELECT set_config('app.account_id', '', true)");
      expect((await client.query('SELECT count(*)::int AS n FROM chunk')).rows[0].n).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it.each(['n6b_app_tenant', 'n6b_app_service'])('%s без SET ROLE не читает таблиц (NOINHERIT, fail-closed)',
    async (role) => {
      // Схема public закрыта для PUBLIC: пользователь входа без SET ROLE не видит даже имён таблиц.
      const pool = role === 'n6b_app_tenant' ? tenant : svc;
      await expect(pool.query('SELECT count(*) FROM public.bot')).rejects.toThrow(/permission denied/);
      await expect(pool.query('SELECT count(*) FROM public.account')).rejects.toThrow(/permission denied/);
      const priv = await owner.query<{ bot: boolean; usage: boolean; bypass: boolean; inherit: boolean }>(
        `SELECT has_table_privilege($1, 'public.bot', 'SELECT') AS bot,
                has_schema_privilege($1, 'public', 'USAGE') AS usage,
                rolbypassrls AS bypass, rolinherit AS inherit FROM pg_roles WHERE rolname = $1`, [role]);
      expect(priv.rows[0]).toEqual({ bot: false, usage: false, bypass: false, inherit: false });
    });

  it('кабинету не выданы session, quota_counter, model_call_log, operator', async () => {
    for (const t of ['session', 'quota_counter', 'model_call_log', 'operator']) {
      await expect(withTenant(tenant, a.accountId, (c) => c.query(`SELECT 1 FROM ${t} LIMIT 1`)), t)
        .rejects.toThrow(/permission denied/);
    }
  });

  it('контекст SET LOCAL не переживает транзакцию (соединение пула не уносит арендатора)', async () => {
    const single = tenantPool(1);
    try {
      await withTenant(single, a.accountId, (c) => c.query('SELECT 1'));
      const leaked = (await single.query<{ v: string | null }>(
        "SELECT current_setting('app.account_id', true) AS v")).rows[0]!.v;
      expect(leaked ?? '').toBe('');
    } finally {
      await single.end();
    }
  });

  it('account: кабинет видит только свою строку', async () => {
    const rows = await withTenant(tenant, a.accountId, async (c) => (await c.query('SELECT id FROM account')).rows);
    expect(rows.map((r) => r.id)).toEqual([a.accountId]);
  });

  it('студия видит подаккаунт только при studio_access=true', async () => {
    const studio = await seedTenant(owner, { kind: 'studio' });
    const child = await seedTenant(owner, { parent: studio.accountId, studioAccess: true, email: null });
    const handedOver = await seedTenant(owner, { parent: studio.accountId, studioAccess: false });
    expect(await count('bot', child.accountId, studio.accountId)).toBe(1);
    expect(await count('bot', handedOver.accountId, studio.accountId)).toBe(0);
    expect(await count('bot', studio.accountId, child.accountId)).toBe(0); // вверх по дереву — нет
  });

  it('непригодный uuid контекста — ошибка, а не «видно всё»', async () => {
    const client = await tenant.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE n6b_tenant');
      await client.query("SELECT set_config('app.account_id', 'not-a-uuid', true)");
      await expect(client.query('SELECT count(*) FROM bot')).rejects.toThrow(/uuid/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('сервисная роль видит все строки — изоляция на её путях только явным WHERE (зафиксировано)', async () => {
    const n = await withService(svc, async (c) => Number((await c.query(
      'SELECT count(DISTINCT account_id)::int AS n FROM chunk WHERE account_id = ANY($1)', [[a.accountId, b.accountId]]))
      .rows[0].n));
    expect(n).toBe(2);
    expect(vector().length).toBeGreaterThan(0);
  });
});
