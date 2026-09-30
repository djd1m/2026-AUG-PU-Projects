import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withService, withTenant } from '../../src/tenant';
import { ownerPool, seedTenant, servicePool, type Tenant, tenantPool, vector } from './helpers';

// 08_review.md F-1: account_id дочерней строки обязан совпадать с account_id родителя. Держат составные FK
// (parent_id, account_id) → parent (id, account_id). Проверка FK идёт в обход RLS, поэтому без них арендатор A вставлял
// source(bot_id = бот B, account_id = A), и WITH CHECK это пропускал.
// Мутация (tests/artifacts/foundation/fix-mutations.txt): составной FK source_file → source заменён одиночным → красный.

interface Fk { conname: string; child: string; parent: string; cols: string[]; refcols: string[] }

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

describe('составные внешние ключи арендатора (F-1)', () => {
  it('каталог: каждая ссылка дочерней таблицы с account_id на родителя с account_id включает пару account_id', async () => {
    const fks = (await owner.query<Fk>(`
      SELECT c.conname, t.relname AS child, p.relname AS parent,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS cols,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
              JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS refcols
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class p ON p.oid = c.confrelid
      WHERE c.contype = 'f' AND t.relnamespace = 'public'::regnamespace
        AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.conrelid AND x.attname = 'account_id' AND NOT x.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.confrelid AND x.attname = 'account_id' AND NOT x.attisdropped)`))
      .rows;
    // Ожидаемые связи известны — пустой перечень означал бы сломанный запрос, а не чистую схему.
    const links = new Set(fks.map((f) => `${f.child}→${f.parent}`));
    for (const link of ['source→bot', 'source_file→source', 'document→source', 'chunk→document', 'chunk→bot',
      'index_job→source', 'question_log→bot', 'model_call_log→bot']) expect(links).toContain(link);
    const tenantPair = (f: Fk) => f.cols.some((col, i) => col === 'account_id' && f.refcols[i] === 'account_id');
    const uncovered = fks.filter((f) => !fks.some((g) => g.child === f.child && g.parent === f.parent && tenantPair(g)
      && f.cols.every((col) => g.cols.includes(col))));
    expect(uncovered.map((f) => `${f.conname} (${f.child}.${f.cols.join(',')} → ${f.parent})`)).toEqual([]);
  });

  // Каждая строка: вставка арендатором A со ссылкой на объект B и account_id = A. Ожидается отказ ИМЕННО названного FK —
  // иначе опечатка в тестовом INSERT зеленела бы любой другой ошибкой.
  const cases: { link: string; fk: string; sql: (t: Tenant, o: Tenant) => [string, unknown[]] }[] = [
    { link: 'source.bot_id', fk: 'source_bot_fk', sql: (t, o) =>
      ["INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://evil.test')", [o.botId, t.accountId]] },
    { link: 'source_file.source_id', fk: 'source_file_source_fk', sql: (t, o) =>
      ["INSERT INTO source_file (source_id, account_id, bytes, sha256) VALUES ($1, $2, '\\x00', 'h')", [o.sourceId, t.accountId]] },
    { link: 'document.source_id', fk: 'document_source_fk', sql: (t, o) =>
      [`INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
        VALUES ($1, $2, 'https://evil.test/x', 'x', 'подложенный текст', 'h')`, [o.sourceId, t.accountId]] },
    { link: 'chunk.document_id', fk: 'chunk_document_fk', sql: (t, o) =>
      [`INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
        VALUES ($1, $2, $3, 5, 't', 'h5', 1, $4)`, [o.documentId, t.botId, t.accountId, vector(3)]] },
    { link: 'chunk.bot_id', fk: 'chunk_bot_fk', sql: (t, o) =>
      [`INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
        VALUES ($1, $2, $3, 6, 't', 'h6', 1, $4)`, [t.documentId, o.botId, t.accountId, vector(5)]] },
    { link: 'index_job.source_id', fk: 'index_job_source_fk', sql: (t, o) =>
      // Кабинет вставляет только (source_id, account_id) (005, F-7); у своего источника уже есть живая задача — ON CONFLICT.
      [`INSERT INTO index_job (source_id, account_id) VALUES ($1, $2)
        ON CONFLICT (source_id) WHERE state IN ('queued', 'running') DO NOTHING`, [o.sourceId, t.accountId]] },
    { link: 'question_log.bot_id', fk: 'question_log_bot_fk', sql: (t, o) =>
      [`INSERT INTO question_log (bot_id, account_id, channel, question, outcome)
        VALUES ($1, $2, 'widget', 'q', 'answered')`, [o.botId, t.accountId]] },
  ];

  it.each(cases)('кабинет A: $link со ссылкой на объект B → отказ $fk', async ({ fk, sql }) => {
    const [text, params] = sql(a, b);
    await expect(withTenant(tenant, a.accountId, (c) => c.query(text, params))).rejects.toThrow(new RegExp(fk));
  });

  it.each(cases)('контроль: $link со ссылкой на СВОЙ объект принимается', async ({ sql }) => {
    const [text, params] = sql(a, a);
    // Вставка в откатываемой транзакции: доказывает, что INSERT корректен и отказ выше дал именно FK.
    await expect(withTenant(tenant, a.accountId, async (c) => {
      await c.query(text, params);
      throw new Error('rollback-ok');
    })).rejects.toThrow('rollback-ok');
  });

  it('служебный путь (BYPASSRLS): model_call_log с ботом B и account_id A → отказ составного FK', async () => {
    await expect(withService(svc, (c) => c.query(
      "INSERT INTO model_call_log (kind, account_id, bot_id, state) VALUES ('answer', $1, $2, 'started')",
      [a.accountId, b.botId]))).rejects.toThrow(/model_call_log_bot_account_fk/);
    await expect(withService(svc, (c) => c.query(
      "INSERT INTO model_call_log (kind, account_id, bot_id, state) VALUES ('answer', NULL, $1, 'started')",
      [b.botId]))).rejects.toThrow(/model_call_log_bot_needs_account/);
  });

  it('служебный путь: source с ботом B и account_id A отвергается и под BYPASSRLS (воркер не индексирует подлог)', async () => {
    await expect(withService(svc, (c) => c.query(
      "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://evil.test')",
      [b.botId, a.accountId]))).rejects.toThrow(/source_bot_fk/);
  });
});
