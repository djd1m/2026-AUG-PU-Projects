// из N5: projects/05-podcast-clips-opus/packages/queue/src/constants.ts — адаптировано: числа канона N6 §7
// «Задача индексации» (сторож раз в минуту, stalled после 5 мин, ≤ 2 автоматических попыток, предел 15 мин);
// DEFER_DELAY_MS N5 не взят — отложенных стадий у N6 нет. Предпросмотр 20 страниц / 40 000 токенов — канон §7.
export const INDEX_QUEUE = 'index' as const;
// Повторы решает PostgreSQL (job_attempt + fence), никогда не счётчик попыток BullMQ.
export const DEFAULT_JOB_OPTIONS = { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 } as const;
export const WATCHDOG_INTERVAL_MS = 60_000;
export const STALLED_AFTER_MS = 5 * 60_000;
export const JOB_DEADLINE_MS = 15 * 60_000;
export const REDELIVER_QUEUED_AFTER_MS = 2 * 60_000;
export const DRAFT_TTL_MS = 24 * 60 * 60_000;
export const MAX_AUTOMATIC_ATTEMPTS = 2;
export const WATCHDOG_BATCH = 500;
// Бюджет задачи предпросмотра — константы кода в index_job.page_budget/embed_budget, не quota_counter (канон §7).
export const PREVIEW_JOB_BUDGET = Object.freeze({ pageBudget: 20, embedBudget: 40_000 });
