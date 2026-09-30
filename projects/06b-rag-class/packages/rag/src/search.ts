// Поиск фрагментов бота (Pseudocode «Answer question» шаг 4; ADR-002; Refinement «Индексы»). Берёт фича rag-answer-sandbox.
//
// Изоляция бота — ТОЛЬКО условие bot_id: поиск идёт служебной ролью n6b_service (BYPASSRLS — публичный виджет не имеет
// аккаунта), RLS не подстрахует. HNSW сканирует граф без фильтра, а WHERE применяется к найденному: без итеративного
// скана при ef_search = 64 ближайших чужих фрагментов выдача бота была бы ПУСТОЙ («не знаю» при наличии ответа).
// hnsw.iterative_scan = strict_order (pgvector ≥ 0.8) добирает кандидатов, пока не наберёт LIMIT своих, в строгом порядке
// расстояния. Потолок добора — hnsw.max_scan_tuples (умолчание 20 000 кортежей): при большем числе чужих фрагментов,
// ближе своих, выдача может прийти неполной (05_completion.md, границы). SET LOCAL живёт до конца транзакции.
// Стражи по исходнику: guards.test.ts «S-17».

import { type Pool, withService } from '@n6b/db';
import { EMBED_DIMENSIONS } from './provider/port.js';

export const SEARCH_TOP_K = 5;
export const HNSW_EF_SEARCH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChunkHit {
  readonly id: string;
  readonly documentId: string;
  readonly text: string;
  /** Косинусное сходство: 1 − расстояние `<=>`. */
  readonly sim: number;
}

export const SEARCH_SQL = `
  SELECT id, document_id, text, 1 - (embedding <=> $2::vector) AS sim
  FROM chunk
  WHERE bot_id = $1
  ORDER BY embedding <=> $2::vector
  LIMIT $3`;

/** Вектор в литерал pgvector; не 1536 конечных чисел — отказ (иначе ошибка БД или бессмысленная выдача). */
export function vectorLiteral(vector: readonly number[]): string {
  if (!Array.isArray(vector) || vector.length !== EMBED_DIMENSIONS
    || !vector.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`вектор не из ${EMBED_DIMENSIONS} конечных чисел: поиск невозможен`);
  }
  return `[${vector.join(',')}]`;
}

/** top-K фрагментов ОДНОГО бота по косинусу через HNSW с итеративным сканом. */
export async function searchChunks(pool: Pool, botId: string, vector: readonly number[], k = SEARCH_TOP_K): Promise<ChunkHit[]> {
  if (typeof botId !== 'string' || !UUID_RE.test(botId)) throw new Error('bot_id не uuid: поиск без бота запрещён');
  if (!Number.isSafeInteger(k) || k < 1 || k > 50) throw new Error('k вне 1…50');
  const literal = vectorLiteral(vector);
  return withService(pool, async (c) => {
    await c.query('SET LOCAL hnsw.iterative_scan = strict_order');
    await c.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
    const res = await c.query<{ id: string; document_id: string; text: string; sim: number }>(SEARCH_SQL, [botId, literal, k]);
    return res.rows.map((r) => ({ id: r.id, documentId: r.document_id, text: r.text, sim: Number(r.sim) }));
  });
}
