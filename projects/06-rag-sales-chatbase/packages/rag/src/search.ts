// Отбор фрагментов для ответа (AnswerQuestion п.4, FR-ANSWER-001, NFR-SEC-001) — написано заново
// (ADR-016: донора нет). Сам поиск — searchChunks (packages/db/src/chunks.ts): точный перебор внутри бота,
// WHERE bot_id = $1 в ТОМ ЖЕ SQL (A-N6-028). Здесь — то, что решает КОД после поиска:
//   1. фрагмент чужого бота не проходит НИКОГДА — вторая линия поверх SQL (поиск может быть подменён или
//      сломан правкой; тогда это сигнал оператору, а не контекст модели);
//   2. порог min_similarity ДО модели: ни одного фрагмента ≥ 0.40 — модель ответа не вызывается.
import { MIN_SIMILARITY, SEARCH_TOP_K } from './constants.js';

// Форма строки поиска; ChunkHit из @n6/db ей соответствует (rag не зависит от db — db зависит от rag).
export interface SearchHit {
  chunkId: string; botId: string; pageId: string; sourceId: string; urlOrPage: string; pageTitle: string;
  contextPath: string; text: string; similarity: number;
}

// ЕДИНСТВЕННАЯ проверка принадлежности фрагмента боту в ядре ответа: её зовут и отбор контекста, и проверка
// цитат после модели (answer.ts). Строгое равенство, без нормализации.
export function ownHit(hit: Pick<SearchHit, 'botId'>, botId: string): boolean {
  return typeof hit.botId === 'string' && hit.botId === botId;
}

export interface Selection { relevant: SearchHit[]; foreign: number; belowThreshold: number }
// Порядок фиксирован: сначала принадлежность, затем порог, затем top_k по убыванию сходства.
export function selectRelevant(hits: readonly SearchHit[], botId: string): Selection {
  const own = hits.filter((hit) => ownHit(hit, botId));
  const passing = own.filter((hit) => Number.isFinite(hit.similarity) && hit.similarity >= MIN_SIMILARITY);
  const relevant = [...passing].sort((a, b) => b.similarity - a.similarity).slice(0, SEARCH_TOP_K);
  return { relevant, foreign: hits.length - own.length, belowThreshold: own.length - passing.length };
}
