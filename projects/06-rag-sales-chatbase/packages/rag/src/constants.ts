// Числа канона §7, которые НЕ являются потолками окружения. Размерность — константа кода (ADR-001):
// другая модель эмбеддингов = миграция и переиндексация, а не правка переменной.
export const EMBED_DIMENSIONS = 1536;
// Закрытый набор моделей (honest-configuration CFG-I8): окружение ВЫБИРАЕТ из кода, а не задаёт.
export const ANSWER_MODELS = ['anthropic/claude-haiku-4.5'] as const;
export const EMBED_MODELS = ['openai/text-embedding-3-small'] as const;
export const SESSION_TTL_DAYS = 7;
