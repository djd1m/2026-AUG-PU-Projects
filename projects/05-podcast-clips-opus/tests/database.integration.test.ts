import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { migrate } from '../packages/db/src/migrate';
import { AuthService, BCRYPT_COST } from '../apps/web/src/server/auth';
import { PgAuthStore } from '../apps/web/src/server/auth-store';

// Compose test передаёт DATABASE_URL с БД n5_test. Без URL логические тесты идут без PostgreSQL.
const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('PostgreSQL: ограничения, миграции и сессии', () => {
  let pool: Pool, auth: AuthService;
  const schema = `foundation_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool); await migrate(pool);
    auth = new AuthService(new PgAuthStore(pool), randomBytes(32).toString('hex'));
  });
  afterAll(async () => {
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
  });
  it('Миграция идемпотентна; все 15 сущностей присутствуют', async () => {
    const result = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> $2', [schema, '_schema_migration']);
    expect(result.rowCount).toBe(15);
    const used = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='quota_counter'", [schema]);
    expect(used.rows.map((r: { column_name: string }) => r.column_name)).not.toContain('limit');
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
  it('12 сравнений bcrypt не удерживают 4 соединения пула', async () => {
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
      expect((await pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    } finally { release(); await Promise.all(calls); compare.mockRestore(); }
  });
  it('8 первых рендеров имеют общий монотонный fence; повтор fence отвергнут', async () => {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ('fence@example.org','test-hash') RETURNING id")).rows[0].id;
    const video = (await pool.query("INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status) VALUES ($1,'one','upload',1,'rendering') RETURNING id", [account])).rows[0].id;
    for (let i = 1; i <= 8; i++) {
      const clip = (await pool.query('INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked) VALUES ($1,$2,0,20,\'Клип\',\'queued\',true) RETURNING id', [video, i])).rows[0].id;
      await pool.query("INSERT INTO job_attempt(video_id,clip_id,stage,attempt_no,fence,status,unit,unit_count,started_at) VALUES ($1,$2,'render',1,$3,'running','none',0,now())", [video, clip, i]);
    }
    await expect(pool.query("INSERT INTO job_attempt(video_id,stage,attempt_no,fence,status,unit,unit_count,started_at) VALUES ($1,'stt',1,1,'running','none',0,now())", [video])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query('UPDATE clip SET score=1,score_hook=1,score_completeness=0,score_length=0 WHERE video_id=$1', [video])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE video SET failure_reason='invented' WHERE id=$1", [video])).rejects.toMatchObject({ code: '23514' });
  });
  it('20 link_view и 10 guest_opened: по одной уникальной записи на /24 за сутки', async () => {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ('events@example.org','test-hash') RETURNING id")).rows[0].id;
    const video = (await pool.query("INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status) VALUES ($1,'events','upload',1,'queued') RETURNING id", [account])).rows[0].id;
    const clip = (await pool.query('INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked) VALUES ($1,1,0,20,\'Клип\',\'queued\',true) RETURNING id', [video])).rows[0].id;
    const link = (await pool.query("INSERT INTO clip_link(clip_id,code) VALUES ($1,'EVENTLINK') RETURNING id", [clip])).rows[0].id;
    const partner = (await pool.query("INSERT INTO partner(account_id,display_name) VALUES ($1,'Ведущий') RETURNING id", [account])).rows[0].id;
    const code = (await pool.query("INSERT INTO partner_code(partner_id,code,status) VALUES ($1,'EVENTCODE','active') RETURNING id", [partner])).rows[0].id;
    const guest = (await pool.query(`INSERT INTO guest_pack(video_id,account_id,code,guest_name,consent_confirmed,consent_version,consent_text_hash,consent_at,host_partner_code_id)
      VALUES ($1,$2,'GUESTCODE','Гость',true,'v1','test-hash',now(),$3) RETURNING id`, [video, account, code])).rows[0].id;
    for (const [type, column, id, count] of [['link_view', 'clip_link_id', link, 20], ['guest_opened', 'guest_pack_id', guest, 10]] as const) {
      const results = await Promise.all(Array.from({ length: count }, () => pool.query(
        `INSERT INTO growth_event(type,${column},ip_prefix,day) VALUES ($1,$2,'192.0.2.0/24','2026-09-21') ON CONFLICT DO NOTHING RETURNING id`, [type, id])));
      expect(results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0)).toBe(1);
    }
  });
});
