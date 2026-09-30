// Боевой вход пакета. Адаптер fake отсюда НЕ экспортируется (страж S-6): тесты берут его по пути.
export * from './provider/port.js';
export { MODELS, OpenRouterProvider, PROVIDER_ROUTING } from './provider/openrouter.js';
export * from './paid-call.js';
export * from './refusal.js';
