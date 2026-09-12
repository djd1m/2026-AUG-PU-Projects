// Формы проверенной конфигурации. До проверки конфигурации в системе нет — есть
// только `process.env`, и ни один модуль, кроме `apps/*/src/env.ts`, его не читает.

/** Реализация поставщика модели. ЗАКРЫТОЕ множество, живёт в коде (DEC-A-009). */
export const MODEL_PROVIDERS = ['fake', 'live'] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** Три потолка вызовов модели (ADR-007). Ни один не имеет значения по умолчанию. */
export interface QuotaLimits {
  /** Личный потолок на пользователя в сутки (канон §7: 10). */
  readonly scanLimitUser: number;
  /** Суточный потолок ВСЕХ попыток системы (канон §7: 3000). */
  readonly scanLimitDay: number;
  /** Суточный потолок эскалаций к Sonnet 5 (канон §7: 600). */
  readonly escalationLimitDay: number;
}

/** Пороги ограничения частоты на один `ip_prefix` (канон §7, DEC-A-013). */
export interface RateLimits {
  /** Мутирующие маршруты: 30 запросов в минуту. */
  readonly mutatePerMinute: number;
  /** Чтение: 120 запросов в минуту. */
  readonly readPerMinute: number;
}

/** Доступ к приватному бакету фото. В этой фиче объекты не кладутся и не читаются. */
export interface StorageConfig {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
}

export interface ApiConfig {
  readonly databaseUrl: string;
  readonly appOrigin: string;
  readonly storage: StorageConfig;
  readonly quota: QuotaLimits;
  readonly rateLimits: RateLimits;
}

export interface RecognizerConfig {
  readonly databaseUrl: string;
  readonly storage: StorageConfig;
  readonly quota: QuotaLimits;
  readonly modelProvider: ModelProvider;
  /** Пусто законно ТОЛЬКО при `modelProvider === 'fake'`; при `live` старт уже отказал. */
  readonly anthropicApiKey: string | undefined;
}
