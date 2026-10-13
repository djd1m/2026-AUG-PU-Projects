// Боевой вход пакета. Адаптер fake отсюда НЕ экспортируется (страж S-6): тесты берут его по пути. Адаптер live тоже НЕ
// экспортируется (страж S-11): платная дверь создаётся только фабрикой createLiveGateway, провайдер наружу не выходит.
export * from './provider/port.js';
export { MODELS, PROVIDER_ROUTING } from './provider/openrouter.js';
// PaidGateway — только тип (index-jobs 08_review.md F-2): значение класса и constructGateway наружу не выходят.
export { type AnswerAttempt, type AnswerChannel, minBatchTokens, type PaidCallDeps, type PaidGateway } from './paid-call.js';
export { createLiveGateway, type LiveGatewayOptions } from './live.js';
export * from './refusal.js';
// Нарезка и поиск (chunk-embed): нарезку зовёт воркер, поиск — ответ (rag-answer-sandbox).
export { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, countTokens, sha256, splitIntoChunks, splitIntoChunksAsync, type TextPart } from './chunk.js';
export { type ChunkHit, HNSW_EF_SEARCH, SEARCH_TOP_K, searchChunks, vectorLiteral } from './search.js';
export { isPublicAddress, resolveSite, type SiteResolver, UnsafeSite, validateSite } from './site-safety.js';
export { createSafeHttp, type SafeHttpOptions, type SiteFetch, type SiteResponse } from './safe-http.js';
