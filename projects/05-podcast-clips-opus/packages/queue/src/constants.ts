import { JOB_STAGE } from '@clipmaker/shared/enums';
export const QUEUE_NAMES = JOB_STAGE;
// PostgreSQL owns retries, never BullMQ's attempts counter.
export const DEFAULT_JOB_OPTIONS = { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 } as const;
export const DEFER_DELAY_MS = 5 * 60_000;
export const STALLED_AFTER_MS = 30 * 60_000;
export const WATCHDOG_INTERVAL_MS = 60_000;
export const MAX_AUTOMATIC_ATTEMPTS = 2;
