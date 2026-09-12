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
