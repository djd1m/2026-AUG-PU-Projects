import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Стражи по исходнику фичи chunk-embed (слой 1). Рядом — прогон на заведомо плохом входе (guard-must-be-able-to-fail).
// S-17: поиск по векторам только в search.ts, с фильтром bot_id и итеративным сканом ДО запроса (ADR-002).
// S-18: эмбеддинги индексации — одно место вызова двери, с оценкой токенов batchTokens (резерв до вызова не занижен).

const ROOT = path.resolve(__dirname, '../../../..');
const SOURCE_DIRS = ['apps/web/src', 'apps/widget', 'services/worker/src', 'packages/db/src', 'packages/rag/src'];
type Files = Record<string, string>;

function collect(dir: string, out: Files = {}): Files {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const item of entries) {
    const full = path.join(dir, item);
    if (item === 'node_modules' || item === 'dist' || item === '.next' || item === 'tests') continue;
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(item)) out[path.relative(ROOT, full)] = readFileSync(full, 'utf8');
  }
  return out;
}
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

export const SEARCH = 'packages/rag/src/search.ts';
export const EMBED_STEP = 'services/worker/src/embed.ts';

export function searchViolations(files: Files): string[] {
  const out: string[] = [];
  for (const [file, raw] of Object.entries(files)) {
    const text = stripComments(raw);
    if (file !== SEARCH && /<=>/.test(text)) out.push(`${file}: поиск по векторам вне search.ts`);
  }
  const s = stripComments(files[SEARCH] ?? '');
  if (!s) return [...out, `${SEARCH}: нет файла поиска`];
  if (!/FROM chunk\s+WHERE bot_id = \$1\s+ORDER BY embedding <=> \$2::vector\s+LIMIT \$3/.test(s)) {
    out.push('SEARCH_SQL: нет фильтра bot_id перед ORDER BY embedding <=> или LIMIT');
  }
  const scan = s.indexOf("SET LOCAL hnsw.iterative_scan = strict_order");
  const query = s.indexOf('c.query<');
  if (scan < 0 || query < 0 || scan > query) out.push('итеративный скан не включён до запроса поиска');
  if (!/return withService\(pool,/.test(s)) out.push('SET LOCAL вне транзакции withService: настройка не доживёт до запроса');
  return out;
}

export function embedCallViolations(files: Files): string[] {
  const out: string[] = [];
  const sites = Object.entries(files).filter(([file, raw]) => file !== 'packages/rag/src/paid-call.ts'
    && /\.embedIndexBatch\s*\(/.test(stripComments(raw))).map(([file]) => file);
  if (sites.length !== 1 || sites[0] !== EMBED_STEP) out.push(`мест вызова embedIndexBatch: ${sites.join(', ') || 'нет'}`);
  const e = stripComments(files[EMBED_STEP] ?? '');
  if (!/\.embedIndexBatch\(job\.accountId, \{ accountId: job\.accountId, botId \}, texts,\s*batchTokens\(batch\)\)/.test(e)) {
    out.push('embedIndexBatch без оценки batchTokens(batch): резерв построится по нижней границе');
  }
  if (!/Math\.max\(exact, minBatchTokens\(/.test(e)) out.push('batchTokens не берёт максимум с нижней границей двери');
  if (!/await holdLease\(c, job\);\s*await c\.query\(INSERT_SQL/.test(e)) out.push('запись частей не под fence задачи');
  return out;
}

describe('стражи chunk-embed: боевое дерево чисто', () => {
  const files = Object.assign({}, ...SOURCE_DIRS.map((d) => collect(path.join(ROOT, d)))) as Files;
  it('дерево прочитано', () => {
    expect(files[SEARCH]).toBeDefined();
    expect(files[EMBED_STEP]).toBeDefined();
  });
  it('S-17: поиск только в search.ts, bot_id и итеративный скан', () => expect(searchViolations(files)).toEqual([]));
  it('S-18: одна точка вызова двери эмбеддингов, оценка сверху, запись под fence', () =>
    expect(embedCallViolations(files)).toEqual([]));
});

describe('стражи chunk-embed умеют падать', () => {
  const search = readFileSync(path.join(ROOT, SEARCH), 'utf8');
  const embed = readFileSync(path.join(ROOT, EMBED_STEP), 'utf8');
  const base = { [SEARCH]: search, [EMBED_STEP]: embed };
  it('S-17 ловит снятый bot_id, снятый скан, скан после запроса и второй поиск', () => {
    expect(searchViolations({ ...base, [SEARCH]: search.replace('WHERE bot_id = $1\n', '') })).not.toEqual([]);
    expect(searchViolations({ ...base, [SEARCH]: search.replace("await c.query('SET LOCAL hnsw.iterative_scan = strict_order');", '') }))
      .not.toEqual([]);
    expect(searchViolations({ ...base, 'apps/web/src/server/x.ts': 'SELECT id FROM chunk ORDER BY embedding <=> $1 LIMIT 5' }))
      .not.toEqual([]);
    expect(searchViolations({ [EMBED_STEP]: embed })).not.toEqual([]); // нет файла поиска — не «чисто»
  });
  it('S-18 ловит оценку без batchTokens, вторую точку вызова и запись без fence', () => {
    expect(embedCallViolations({ ...base, [EMBED_STEP]: embed.replace('batchTokens(batch))', 'undefined)') })).not.toEqual([]);
    expect(embedCallViolations({ ...base, 'services/worker/src/x.ts': 'await gw.embedIndexBatch(a, o, t)' })).not.toEqual([]);
    expect(embedCallViolations({ ...base, [EMBED_STEP]: embed.replace('await holdLease(c, job);\n      await c.query(INSERT_SQL',
      'await c.query(INSERT_SQL') })).not.toEqual([]);
    expect(embedCallViolations({ ...base, [EMBED_STEP]: embed.replace('Math.max(exact, minBatchTokens(', 'Math.min(exact, minBatchTokens(') }))
      .not.toEqual([]);
  });
});
