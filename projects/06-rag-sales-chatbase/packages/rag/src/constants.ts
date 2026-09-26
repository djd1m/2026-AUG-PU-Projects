// Числа канона §7, которые НЕ являются потолками окружения. Размерность — константа кода (ADR-001):
// другая модель эмбеддингов = миграция и переиндексация, а не правка переменной.
export const EMBED_DIMENSIONS = 1536;
// Закрытый набор моделей (honest-configuration CFG-I8): окружение ВЫБИРАЕТ из кода, а не задаёт.
export const ANSWER_MODELS = ['anthropic/claude-haiku-4.5'] as const;
export const EMBED_MODELS = ['openai/text-embedding-3-small'] as const;
export const SESSION_TTL_DAYS = 7;

// PDF — канон §7 («PDF: ≤ 10 МБ, ≤ 100 страниц, только с текстовым слоем», «Планы»: 3 / 10), FR-SOURCE-003,
// Pseudocode CreateSource п.2 и ExtractPdf. Общие для web (граница приёма) и worker-index (разбор):
// одно число — одно место, иначе граница и разбор разойдутся молча.
export const PDF_MAX_BYTES = 10 * 1024 * 1024;       // по Content-Length И по фактически принятым байтам
export const PDF_MAX_PAGES = 100;                    // число страниц — из документа, ДО извлечения текста
export const PDF_MIN_PAGE_TEXT_CHARS = 20;           // ExtractPdf п.2: меньше — страница без текстового слоя
export const PDF_NO_TEXT_SHARE = 0.9;                // ≥ 90 % таких страниц → no_text_layer (скан)
export const PDFS_BY_PLAN = Object.freeze({ free: 3, nobadge: 10, studio: 10 } as const);
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];    // «%PDF-»: тип по первым байтам, не по расширению
export function isPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= PDF_MAGIC.length && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

// Фрагменты и эмбеддинги — канон §7 «Поиск и ответ» (A-N6-013: гипотезы до калибровки), FR-INDEX-001/002,
// Pseudocode ChunkDocument / EmbedAndStore. Токены — ОЦЕНКА кода (packages/rag/src/chunk.ts,
// estimateTokens), а не счёт токенизатора поставщика: фактические токены пишутся в журнал попыток
// (tokens_actual) и сверяются с оценкой по журналу.
export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_MAX_TOKENS = 600;                 // CHECK token_count BETWEEN 1 AND 600 в 001_init.sql
export const CHUNK_OVERLAP_TOKENS = 80;
export const CONTEXT_PATH_SEPARATOR = ' › ';
export const CONTEXT_HEADING_MAX_CHARS = 120;        // один заголовок в пути; путь не раздувает вход эмбеддинга
export const EMBED_BATCH_MAX = 64;                   // EmbedAndStore п.1: пачки по ≤ 64 фрагмента
export const EMBED_RETRIES = 2;                      // EmbedAndStore п.2: 2 повтора при 429/5xx, каждый — новое списание
export const SEARCH_TOP_K = 4;                       // канон §7: top_k = 4

// ADR-001: колонка vector(1536). ЕДИНСТВЕННАЯ проверка длины вектора в коде — её зовут и клиент шлюза
// (openrouter.ts), и EmbedAndStore перед записью, и запись фрагментов (packages/db/src/chunks.ts).
export function isEmbeddingOfDimension(vector: unknown): vector is number[] {
  return Array.isArray(vector) && vector.length === EMBED_DIMENSIONS && vector.every((x) => typeof x === 'number' && Number.isFinite(x));
}
