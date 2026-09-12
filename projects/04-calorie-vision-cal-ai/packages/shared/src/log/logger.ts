// Структурированный журнал: одна строка — один JSON (NFR-foundation-2).
//
// Тела запросов, cookie и байты фото сюда не попадают вовсе — не потому, что их
// «забыли передать», а потому что вызывающий передаёт названные поля, а редактор
// затирает запрещённые значения и имена (`redact.ts`).

import { createRedactor, type RedactorOptions } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  readonly request_id?: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(bound: LogFields): Logger;
}

/**
 * Поля, которым разрешено попасть в журнал сервиса. Список ЗАКРЫТЫЙ и живёт в коде:
 * новое поле события добавляется сюда осознанно, а не приезжает вместе с ошибкой.
 */
export const SERVICE_LOG_FIELDS: readonly string[] = [
  'request_id', 'event', 'route', 'method', 'status', 'code', 'signal', 'port',
  'variables', 'scan_limit_user', 'scan_limit_day', 'escalation_limit_day',
  'rate_limit_mutate_per_min', 'rate_limit_read_per_min', 'model_provider', 'model',
  'ip_prefix', 'scan_id', 'fence', 'lease_owner', 'provider', 'write',
  'never_leased', 'attempts_exhausted', 'message', 'duration_ms',
];

export interface LoggerOptions extends RedactorOptions {
  readonly service: string;
  /** Куда писать строку. Подменяется в тестах гигиены журнала. */
  readonly sink?: (line: string) => void;
  readonly now?: () => Date;
}

export function createLogger(options: LoggerOptions): Logger {
  const redact = createRedactor(options);
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());

  const emit = (level: LogLevel, event: string, bound: LogFields, fields: LogFields | undefined): void => {
    const payload = redact({ ...bound, ...(fields ?? {}) }) as Record<string, unknown>;
    sink(JSON.stringify({ time: now().toISOString(), level, service: options.service, event, ...payload }));
  };

  const build = (bound: LogFields): Logger => ({
    debug: (event, fields) => emit('debug', event, bound, fields),
    info: (event, fields) => emit('info', event, bound, fields),
    warn: (event, fields) => emit('warn', event, bound, fields),
    error: (event, fields) => emit('error', event, bound, fields),
    child: (extra) => build({ ...bound, ...extra }),
  });

  return build({});
}
