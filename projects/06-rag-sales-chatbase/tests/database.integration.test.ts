// из N5: projects/05-podcast-clips-opus/tests/database.integration.test.ts — схема N6 (19 сущностей,
// pgvector), ADR-001 Confirmation (HNSW на 1536 строится, на 3072 падает), CHECK-инварианты канона.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { AuthService, BCRYPT_COST } from '../apps/web/src/server/auth';
import { PgAuthStore } from '../apps/web/src/server/auth-store';
import { ipPrefix } from '../apps/web/src/server/ip';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

// compose.test.yml передаёт DATABASE_URL с БД n6_test. Без URL набор пропускается, и отчёт это кричит;
// при N6_ACCEPTANCE=1 пропуск валит прогон (scripts/test-skip-reporter.ts).
const databaseUrl = process.env.DATABASE_URL;
const vector = (n: number, x = 0.1) => `[${Array.from({ length: n }, () => x).join(',')}]`;
describe.skipIf(!databaseUrl)('PostgreSQL + pgvector: миграции, ограничения, сессии', () => {
  let pool: Pool, auth: AuthService;
  const schema = `foundation_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool); await migrate(pool);
    auth = new AuthService(new PgAuthStore(pool), randomBytes(32).toString('hex'));
  });
  afterAll(async () => {
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
  });
  async function bot(status = 'active') {
    const account = (await pool.query('INSERT INTO account(email,password_hash) VALUES ($1,$2) RETURNING id', [`${randomUUID()}@example.org`, 'x'])).rows[0].id;
    return (await pool.query('INSERT INTO bot(account_id,status,public_key,company_name) VALUES ($1,$2,$3,$4) RETURNING id',
      [account, status, randomBytes(16).toString('base64url').slice(0, 22), 'Компания'])).rows[0].id as string;
  }
  it('миграция идемпотентна; 19 сущностей; у quota_counter нет колонки предела', async () => {
    const result = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> $2', [schema, '_schema_migration']);
    expect(result.rowCount).toBe(19);
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='quota_counter'", [schema]);
    expect(columns.rows.map((r: { column_name: string }) => r.column_name)).not.toContain('limit');
  });
  it('ADR-001: pgvector ≥ 0.8, HNSW cosine на chunk.embedding с m=16, ef_construction=64', async () => {
    const ext = await pool.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
    expect(ext.rows[0].extversion).toMatch(/^0\.(8|9)\.|^[1-9]\./);
    const index = await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='chunk_embedding_hnsw'", [schema]);
    expect(index.rows[0].indexdef).toMatch(/USING hnsw \(embedding vector_cosine_ops\) WITH \(m='?16'?, ef_construction='?64'?\)/);
  });
  it('ADR-001 Confirmation: вектор 1536 вставляется и ищется; 1535 отвергнут; HNSW на vector(3072) падает', async () => {
    const botId = await bot();
    const source = (await pool.query("INSERT INTO source(bot_id,kind,root_url) VALUES ($1,'site','https://example.org') RETURNING id", [botId])).rows[0].id;
    const page = (await pool.query("INSERT INTO page(source_id,bot_id,url_or_page,content_hash) VALUES ($1,$2,'https://example.org/',$3) RETURNING id",
      [source, botId, 'a'.repeat(64)])).rows[0].id;
    await pool.query('INSERT INTO chunk(bot_id,source_id,page_id,ordinal,text,token_count,embedding) VALUES ($1,$2,$3,0,$4,10,$5)', [botId, source, page, 'Цены', vector(1536)]);
    const found = await pool.query('SELECT 1 - (embedding <=> $2) AS similarity FROM chunk WHERE bot_id = $1 ORDER BY embedding <=> $2 LIMIT 4', [botId, vector(1536)]);
    expect(Number(found.rows[0].similarity)).toBeCloseTo(1, 5);
    await expect(pool.query('INSERT INTO chunk(bot_id,source_id,page_id,ordinal,text,token_count,embedding) VALUES ($1,$2,$3,1,$4,10,$5)',
      [botId, source, page, 'x', vector(1535)])).rejects.toThrow(/1536/);
    await pool.query('CREATE TABLE wide_probe (embedding vector(3072))');
    await expect(pool.query('CREATE INDEX ON wide_probe USING hnsw (embedding vector_cosine_ops)')).rejects.toThrow(/2000 dimensions/);
    await pool.query('DROP TABLE wide_probe');
  });
  it('CHECK-инварианты: черновик без владельца, текст вопроса только у unknown, причина только у failed, IP только префиксом', async () => {
    await pool.query("INSERT INTO bot(status,public_key,company_name) VALUES ('draft',$1,'Черновик')", [randomBytes(16).toString('base64url').slice(0, 22)]);
    await expect(pool.query("INSERT INTO bot(status,public_key,company_name) VALUES ('active',$1,'Ничей')", [randomBytes(16).toString('base64url').slice(0, 22)]))
      .rejects.toMatchObject({ code: '23514', constraint: 'bot_owner_required' });
    const botId = await bot();
    await expect(pool.query("INSERT INTO question_log(bot_id,outcome,text,text_expires_at) VALUES ($1,'answered','вопрос',now())", [botId]))
      .rejects.toMatchObject({ code: '23514', constraint: 'question_text_only_unknown' });
    await pool.query("INSERT INTO question_log(bot_id,outcome,text,text_expires_at) VALUES ($1,'unknown','вопрос',now() + interval '14 days')", [botId]);
    const source = (await pool.query("INSERT INTO source(bot_id,kind,file_name) VALUES ($1,'pdf','price.pdf') RETURNING id", [botId])).rows[0].id;
    await expect(pool.query("INSERT INTO index_job(bot_id,source_id,idempotency_key,status) VALUES ($1,$2,$3,'failed')", [botId, source, randomUUID()]))
      .rejects.toMatchObject({ code: '23514', constraint: 'index_job_reason_iff_failed' });
    await expect(pool.query("INSERT INTO visitor_session(bot_id,ip_prefix,origin) VALUES ($1,'203.0.113.9/32','https://a.ru')", [botId]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE account SET plan='NOBADGE' WHERE id=(SELECT account_id FROM bot WHERE id=$1)", [botId])).rejects.toMatchObject({ code: '23514' });
  });
  it('quota_counter: вид предела в ключе обязателен; (scope, scope_key, period) уникален', async () => {
    await expect(pool.query("INSERT INTO quota_counter(scope,scope_key,period) VALUES ('preview_session','browser-1','2026-09-25')"))
      .rejects.toMatchObject({ constraint: 'quota_preview_session_kind' });
    await expect(pool.query("INSERT INTO quota_counter(scope,scope_key,period) VALUES ('global_previews','all','2026-09-25')"))
      .rejects.toMatchObject({ constraint: 'quota_global_previews_kind' });
    const results = await Promise.all(Array.from({ length: 10 }, () => pool.query(
      "INSERT INTO quota_counter(scope,scope_key,period) VALUES ('preview_session','browser-1:answers','2026-09-25') ON CONFLICT DO NOTHING RETURNING id")));
    expect(results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0)).toBe(1);
  });
  it('12 конкурентных регистраций оставляют один аккаунт и одну сессию; cookie дубля не авторизует', async () => {
    const tokens = await Promise.all(Array.from({ length: 12 }, () => auth.register('race@example.org', 'пароль аккаунта', '192.0.2.0/24')));
    expect((await pool.query("SELECT id FROM account WHERE email='race@example.org'")).rowCount).toBe(1);
    expect((await Promise.all(tokens.map((t) => auth.authenticate(t)))).filter(Boolean)).toHaveLength(1);
  });
  it('logout отозван в БД; повторное использование cookie отвергается', async () => {
    const token = await auth.register('logout@example.org', 'пароль аккаунта', '192.0.2.0/24');
    expect(await auth.authenticate(token)).not.toBeNull();
    await auth.logout(token); expect(await auth.authenticate(token)).toBeNull();
  });
  it('вход: верный пароль даёт сессию, неверный и erasing — нет', async () => {
    await auth.register('login@example.org', 'пароль аккаунта', '192.0.2.0/24');
    expect(await auth.login('login@example.org', 'пароль аккаунта', '192.0.2.0/24')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await auth.login('login@example.org', 'чужой пароль', '192.0.2.0/24')).toBeNull();
    await pool.query("UPDATE account SET status='erasing', erase_deadline=now() + interval '72 hours' WHERE email='login@example.org'");
    expect(await auth.login('login@example.org', 'пароль аккаунта', '192.0.2.0/24')).toBeNull();
  });
  it('12 сравнений bcrypt не удерживают соединения пула', async () => {
    const hash = await bcrypt.hash('пароль аккаунта', BCRYPT_COST);
    await pool.query('INSERT INTO account(email,password_hash) VALUES ($1,$2)', ['pool@example.org', hash]);
    let enter!: () => void, release!: () => void, count = 0;
    const allEntered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const compare = vi.spyOn(bcrypt, 'compare').mockImplementation(async () => {
      if (++count === 12) enter(); await gate; return false;
    });
    const calls = Array.from({ length: 12 }, () => auth.login('pool@example.org', 'неверный пароль', '192.0.2.0/24'));
    try {
      await Promise.race([allEntered, new Promise((_, reject) => setTimeout(() => reject(new Error('Пул удерживается во время bcrypt')), 2000))]);
      expect(pool.totalCount - pool.idleCount).toBe(0);
      expect((await pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    } finally { release(); await Promise.all(calls); compare.mockRestore(); }
  });
  it('IPv6 /48 и IPv4 /24 принимаются настоящей колонкой session.ip_prefix', async () => {
    for (const [index, ip] of ['2001:db8:1234::1', '::1', '203.0.113.9'].entries()) {
      const token = await auth.register(`ip-${index}@example.org`, 'пароль аккаунта', ipPrefix(ip));
      expect(await auth.authenticate(token)).not.toBeNull();
      const result = await pool.query('SELECT ip_prefix = $1::cidr AS matches FROM session WHERE token_hash=$2', [ipPrefix(ip), auth.tokenHash(token)]);
      expect(result.rows[0].matches).toBe(true);
    }
  });
});
