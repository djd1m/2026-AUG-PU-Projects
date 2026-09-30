import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerPool, servicePool } from '../../../db/tests/int/helpers';
import { searchChunks, vectorLiteral } from '../../src/search';

// ADR-002 «Подтверждение»: top-5 бота B не содержит фрагментов бота A при 10 000 чужих фрагментов — и чужие БЛИЖЕ к
// вопросу, чем свои. Без фильтра bot_id выдача была бы целиком из A; без итеративного скана HNSW (ef_search = 64
// ближайших — все чужие) после фильтра выдача была бы ПУСТОЙ. Векторы строит сама БД (setseed) — 10 000 × 1536 чисел
// не гоняются через протокол. У маленького бота планировщик законно берёт btree bot_id и точную сортировку — там
// итеративный скан не нужен; опасен путь HNSW, поэтому свой бот здесь крупный и тест плана это фиксирует.

const owner = ownerPool();
const app = servicePool(4);
afterAll(async () => { await owner.end(); await app.end(); });

const FOREIGN = 10_000;
const OWN = 3_000; // свой бот крупный: планировщик выбирает HNSW, а не btree bot_id + сортировку (см. тест плана)
let botA: string;
let botB: string;
let query: number[];

async function seedBot(tag: string): Promise<{ accountId: string; botId: string; documentId: string }> {
  const acc = (await owner.query<{ id: string }>("INSERT INTO account (email, password_hash) VALUES ($1, 'x') RETURNING id",
    [`${tag}-${randomBytes(6).toString('hex')}@search.test`])).rows[0]!.id;
  const bot = (await owner.query<{ id: string }>("INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'b') RETURNING id",
    [acc, randomBytes(9).toString('base64url')])).rows[0]!.id;
  const src = (await owner.query<{ id: string }>(
    "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://search.test') RETURNING id", [bot, acc])).rows[0]!.id;
  const doc = (await owner.query<{ id: string }>(`INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
    VALUES ($1, $2, 'https://search.test/p', 'p', 't', 'h') RETURNING id`, [src, acc])).rows[0]!.id;
  return { accountId: acc, botId: bot, documentId: doc };
}

beforeAll(async () => {
  await owner.query('SELECT setseed(0.42)');
  const base = (await owner.query<{ v: number[] }>(
    'SELECT array_agg(random() - 0.5 ORDER BY g) AS v FROM generate_series(1, 1536) g')).rows[0]!.v;
  query = base.map(Number);
  const a = await seedBot('sa');
  const b = await seedBot('sb');
  botA = a.botId;
  botB = b.botId;
  // Чужие: вопрос + шум 0.01 (сходство ≈ 0.999). Свои: вопрос + шум 0.2 (сходство ниже) — свои ДАЛЬШЕ чужих.
  const insert = (who: typeof a, n: number, noise: number, prefix: string) => owner.query(`
    INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
    SELECT $1, $2, $3, i, $6 || i, md5($6 || i), 1,
      (SELECT array_agg(q.x + (random() - 0.5) * $5 ORDER BY q.ord)
         FROM unnest($4::float8[]) WITH ORDINALITY AS q(x, ord) WHERE i > 0)::vector
    FROM generate_series(1, $7) AS i`, [who.documentId, who.botId, who.accountId, query, noise, prefix, n]);
  await insert(a, FOREIGN, 0.01, 'чужой-');
  await insert(b, OWN, 0.2, 'свой-');
  await owner.query('ANALYZE chunk');
}, 300_000);

describe('ADR-002: поиск top-K изолирован по боту', () => {
  it('исходные данные: 10 000 чужих фрагментов ближе к вопросу, чем любой свой', async () => {
    const r = await owner.query<{ bot_id: string; best: number; n: number }>(`
      SELECT bot_id, max(1 - (embedding <=> $1::vector)) AS best, count(*)::int AS n FROM chunk
      WHERE bot_id = ANY ($2::uuid[]) GROUP BY bot_id`, [vectorLiteral(query), [botA, botB]]);
    const byBot = Object.fromEntries(r.rows.map((x) => [x.bot_id, x]));
    expect(byBot[botA]!.n).toBe(FOREIGN);
    expect(byBot[botB]!.n).toBe(OWN);
    const worstForeign = (await owner.query<{ w: number }>(
      'SELECT min(1 - (embedding <=> $1::vector)) AS w FROM chunk WHERE bot_id = $2', [vectorLiteral(query), botA])).rows[0]!.w;
    expect(Number(worstForeign)).toBeGreaterThan(Number(byBot[botB]!.best));
  });

  it('индекс HNSW vector_cosine_ops используется запросом поиска (план)', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE n6b_service');
      await c.query('SET LOCAL hnsw.iterative_scan = strict_order');
      const plan = await c.query(`EXPLAIN SELECT id FROM chunk WHERE bot_id = $1 ORDER BY embedding <=> $2::vector LIMIT 5`,
        [botB, vectorLiteral(query)]);
      await c.query('ROLLBACK');
      expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/chunk_embedding_hnsw/);
    } finally { c.release(); }
  });

  it('top-5 бота B: ровно 5 своих, ни одного чужого, по убыванию сходства', async () => {
    const hits = await searchChunks(app, botB, query, 5);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.text.startsWith('свой-'))).toBe(true);
    for (let i = 1; i < hits.length; i += 1) expect(hits[i - 1]!.sim).toBeGreaterThanOrEqual(hits[i]!.sim);
  });

  it('бот A получает свои (и только свои) фрагменты', async () => {
    const hits = await searchChunks(app, botA, query, 5);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.text.startsWith('чужой-'))).toBe(true);
  });

  it('непригодный вход — отказ до БД: не uuid, вектор не 1536, NaN, k вне предела', async () => {
    await expect(searchChunks(app, 'bot', query)).rejects.toThrow(/bot_id/);
    await expect(searchChunks(app, botB, query.slice(1))).rejects.toThrow(/1536/);
    await expect(searchChunks(app, botB, query.map((x, i) => (i === 3 ? Number.NaN : x)))).rejects.toThrow(/1536/);
    await expect(searchChunks(app, botB, query, 0)).rejects.toThrow(/k вне/);
  });
});
