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
// Канон §7 «Планы»: ботов на аккаунт (ClaimPreview п.3 — проверка предела плана при сохранении черновика).
export const BOTS_BY_PLAN = Object.freeze({ free: 1, nobadge: 1, studio: 10 } as const);
// Канон §7 «Планы»: страниц на бота (бюджет обхода источника). Общая для worker-index (обход) и web (страница тарифов):
// одно число — одно место (перенесено сюда из apps/worker/src/crawl/limits.ts фичей tariffs-and-interest).
export const PAGES_BY_PLAN = Object.freeze({ free: 50, nobadge: 300, studio: 300 } as const);
// Цены платных планов, копейки (канон §7 «Планы», гипотеза A-N6-004; подтверждено владельцем 26.09, A-N6-040).
// Деньги — целое число копеек ВЕЗДЕ (донор N4 provider.ts); строка «990 ₽» собирается из числа, а не хранится рядом.
export const PLAN_PRICE_MINOR = Object.freeze({ nobadge: 99_000, studio: 490_000 } as const);
export type PaidPlan = keyof typeof PLAN_PRICE_MINOR;
export const PAID_PLANS = ['nobadge', 'studio'] as const satisfies readonly PaidPlan[];
// Оплата разовая на 30 дней без автопродления (решение владельца 26.09, A-N6-040).
export const PAID_PLAN_DAYS = 30;
// Старшинство планов: оплата и оператор выдают СТАРШИЙ из действующего и нового (студия поверх «Без бейджа» — без
// пересчёта остатка, решение владельца 26.09).
export const PLAN_RANK = Object.freeze({ free: 0, nobadge: 1, studio: 2 } as const);
export const isPaidPlan = (value: unknown): value is PaidPlan => value === 'nobadge' || value === 'studio';
// «990 ₽», «4 900 ₽»: неразрывный пробел между разрядами и перед знаком рубля.
export function formatRubles(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor % 100 !== 0) throw new Error('Цена плана обязана быть целым числом рублей в копейках');
  return `${String(minor / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0₽`;
}
// Предпросмотр (канон §7, FR-PREVIEW-001): живёт 24 ч до сохранения; cookie — на тот же срок.
export const PREVIEW_TTL_HOURS = 24;
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
// source-lifecycle (фича 16, канон §7 дополнен; числа — код, не окружение, CFG-I8):
// фрагментов на одну страницу/лист PDF — больше не эмбеддится и не пишется (page.chunks_dropped); ≈ 150 000 токенов,
// транзакция страницы не держит соединение пула десятки секунд (перенос ревью chunk-embed MEDIUM)
export const CHUNKS_PER_PAGE_MAX = 300;
// токенов эмбеддингов на СЕРИЮ одного источника (index_job.series_embed_used): один источник не съедает суточный
// предел аккаунта (перенос chunk-embed); по плану — платный план читает до 300 страниц (PAGES_BY_PLAN)
export const SOURCE_EMBED_BUDGET_BY_PLAN = Object.freeze({ free: 500_000, nobadge: 1_000_000, studio: 1_000_000 } as const);
// запусков индексации на бота в сутки МСК (index_start): создание сайта/PDF, «Повторить», «Обновить»; отказавшие
// СЧИТАЮТСЯ — единственный воркер платформы не занимается бесконечными отказами (перенос pdf-source MEDIUM-1)
export const INDEX_STARTS_PER_BOT_DAY = 20;
export const EMBED_RETRIES = 2;                      // EmbedAndStore п.2: 2 повтора при 429/5xx, каждый — новое списание
export const SEARCH_TOP_K = 4;                       // канон §7: top_k = 4

// ADR-001: колонка vector(1536). ЕДИНСТВЕННАЯ проверка длины вектора в коде — её зовут и клиент шлюза
// (openrouter.ts), и EmbedAndStore перед записью, и запись фрагментов (packages/db/src/chunks.ts).
export function isEmbeddingOfDimension(vector: unknown): vector is number[] {
  return Array.isArray(vector) && vector.length === EMBED_DIMENSIONS && vector.every((x) => typeof x === 'number' && Number.isFinite(x));
}

// Ответ по фрагментам — канон §7 «Поиск и ответ», FR-ANSWER-001…003, Pseudocode AnswerQuestion /
// ValidateModelAnswer. Порог — ЧИСЛО В КОДЕ, не окружение (FR-ANSWER-001): гипотеза A-N6-013 до калибровки
// 20 + 20 (docs/measurements/threshold-calibration.md). Сравнение «≥»: ровно 0.40 проходит.
export const MIN_SIMILARITY = 0.40;
export const QUESTION_MAX_CHARS = 500;               // символы (кодовые точки), FR-ANSWER-001
export const HISTORY_TURNS = 2;                      // 2 предыдущих хода (вопрос + ответ)
export const ANSWER_TEXT_MAX_CHARS = 1200;           // ValidateModelAnswer п.4: текст обрезается до 1200
export const SOURCE_EXCERPT_MAX_CHARS = 160;         // FR-ANSWER-002: первые ≤ 160 символов фрагмента в плашке
export const QUESTION_TEXT_TTL_DAYS = 14;            // 152-ФЗ: текст вопроса — только у unknown и 14 дней

// Удаление аккаунта — канон §7 «Удаление аккаунта», FR-AUTH-002, NFR-SEC-003; решения владельца A-N6-054.
// Срок ≤ 72 ч; сессии и виджеты гаснут сразу; физическое стирание — первый проход сторожа после тихого часа (задачи,
// начатые до запроса, успевают упереться в фенс). Партнёру с доступным ≥ минимума выплаты оператор платит, пока до
// срока остаётся больше запаса; дальше остаток сгорает и стирание завершается в срок.
export const ERASE_DEADLINE_HOURS = 72;
export const ERASURE_QUIET_MS = 60 * 60 * 1000;
export const ERASURE_PAYOUT_MARGIN_HOURS = 6;
export const ERASURE_BATCH = 50;                     // аккаунтов за проход сторожа; остальные — следующим проходом
