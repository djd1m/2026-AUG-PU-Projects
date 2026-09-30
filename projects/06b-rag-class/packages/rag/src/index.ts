// Боевой вход пакета. Адаптер fake отсюда НЕ экспортируется (страж S-6): тесты берут его по пути. Адаптер live тоже НЕ
// экспортируется (страж S-11): платная дверь создаётся только фабрикой createLiveGateway, провайдер наружу не выходит.
export * from './provider/port.js';
export { MODELS, PROVIDER_ROUTING } from './provider/openrouter.js';
// PaidGateway — только тип (index-jobs 08_review.md F-2): значение класса и constructGateway наружу не выходят.
export { type AnswerAttempt, type AnswerChannel, minBatchTokens, type PaidCallDeps, type PaidGateway } from './paid-call.js';
export { createLiveGateway, type LiveGatewayOptions } from './live.js';
export * from './refusal.js';
