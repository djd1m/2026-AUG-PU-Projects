// Boot config check (Pseudocode → «Boot config check», FR-n6b-16, NFR-n6b-3, SC-US-016-2).
// Один валидатор на все процессы; СПИСКИ переменных — у каждого процесса (web: apps/web/src/server/config.ts,
// worker: services/worker/src/config.ts). Закрытый список в коде, окружение его не расширяет (CFG-I8).
// Отсутствие и '' различаются в сообщении, но оба — отказ (CFG-I1, CFG-I2). Дефолтов нет намеренно.

export type VarKind = 'secret' | 'limit' | 'ratio' | 'base-url';

export interface VarSpec {
  readonly name: string;
  readonly kind: VarKind;
  /** Внешнее последствие отсутствия — попадает в сообщение отказа. */
  readonly consequence: string;
}

/** Персональный предел не может быть больше общего — иначе он не сработает никогда (model-call-cost.md). */
export interface PairRule {
  readonly personal: string;
  readonly total: string;
}

export class ConfigError extends Error {
  constructor(readonly variable: string, message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const SECRET_MIN_LENGTH = 32;

export type ConfigValues = Readonly<Record<string, string | number>>;

function parseOne(spec: VarSpec, raw: string, production: boolean): string | number {
  const bad = (why: string) => new ConfigError(spec.name, `${spec.name} ${why}: ${spec.consequence}`);
  switch (spec.kind) {
    case 'secret':
      if (spec.name.endsWith('_SECRET') && raw.length < SECRET_MIN_LENGTH) {
        throw bad(`короче ${SECRET_MIN_LENGTH} символов`);
      }
      return raw;
    case 'limit': {
      // Только положительное целое без знаков, пробелов и экспоненты: Number('') === 0, Number('1e3') === 1000.
      if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw bad('не положительное целое');
      return Number(raw);
    }
    case 'ratio': {
      if (!/^(0|1)?\.[0-9]+$|^0$|^1$/.test(raw)) throw bad('не число от 0 до 1');
      const value = Number(raw);
      if (!(value > 0 && value < 1)) throw bad('вне интервала (0, 1)');
      return value;
    }
    case 'base-url': {
      let url: URL;
      try { url = new URL(raw); } catch { throw bad('не URL'); }
      const allowed = production ? ['https:'] : ['https:', 'http:'];
      if (!allowed.includes(url.protocol)) throw bad(production ? 'не https-URL' : 'не http(s)-URL');
      if (!url.hostname) throw bad('без хоста');
      if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw bad('должен быть origin без пути, запроса и учётных данных');
      }
      return url.origin;
    }
  }
}

/**
 * Проверяет окружение по закрытому списку. Возвращает разобранные значения или бросает ConfigError,
 * называющий ПЕРВУЮ непригодную переменную и последствие.
 */
export function checkConfig(specs: readonly VarSpec[], pairs: readonly PairRule[],
  env: Readonly<Record<string, string | undefined>>, production: boolean): ConfigValues {
  const values: Record<string, string | number> = {};
  for (const spec of specs) {
    const raw = env[spec.name];
    if (raw === undefined) throw new ConfigError(spec.name, `${spec.name} не задан: ${spec.consequence}`);
    if (raw === '') throw new ConfigError(spec.name, `${spec.name} задан пустым: ${spec.consequence}`);
    values[spec.name] = parseOne(spec, raw, production);
  }
  for (const { personal, total } of pairs) {
    const p = values[personal];
    const t = values[total];
    if (typeof p !== 'number' || typeof t !== 'number') {
      throw new ConfigError(personal, `пара ${personal}/${total} не объявлена в списке: проверка НЕ выполнена`);
    }
    if (p > t) {
      throw new ConfigError(personal, `${personal} (${p}) больше ${total} (${t}): персональный предел не сработает никогда`);
    }
  }
  return values;
}

/** Отказ старта: печатает имя переменной и последствие (значение не печатается никогда) и завершает процесс с 1. */
export function enforceBootConfig<T>(load: () => T, exit: (code: number) => never = process.exit,
  report: (line: string) => void = (line) => console.error(line)): T {
  try {
    return load();
  } catch (error) {
    if (error instanceof ConfigError) {
      report(`Проверка конфигурации: ${error.message}. Сервис не стартует.`);
      return exit(1);
    }
    throw error;
  }
}
