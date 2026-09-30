// Boot config check (Pseudocode → «Boot config check», FR-n6b-16, NFR-n6b-3, SC-US-016-2).
// Один валидатор на все процессы; СПИСКИ переменных — у каждого процесса (web: apps/web/src/server/config.ts,
// worker: services/worker/src/config.ts). Закрытый список в коде, окружение его не расширяет (CFG-I8).
// Отсутствие и '' различаются в сообщении, но оба — отказ (CFG-I1, CFG-I2). Дефолтов нет намеренно.

export type VarKind = 'secret' | 'limit' | 'ratio' | 'base-url' | 'pg-url';

export interface VarSpec {
  readonly name: string;
  readonly kind: VarKind;
  /** Внешнее последствие отсутствия — попадает в сообщение отказа. */
  readonly consequence: string;
  /** Только для 'pg-url': пользователь входа, которым ОБЯЗАНА быть строка подключения (роли не перепутать местами). */
  readonly user?: string;
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

function decodeUrlPart(part: string): string | null {
  try { return decodeURIComponent(part); } catch { return null; }
}

/**
 * Строка подключения Postgres с URL-кодированными именем и паролем. Пароль с `@ / # % :` без кодирования сдвигает
 * хост или роняет разбор (08_review.md R-2); здесь он проходит без искажений.
 */
export function pgUrl(parts: { user: string; password: string; host: string; port?: number; database: string }): string {
  const enc = encodeURIComponent;
  return `postgresql://${enc(parts.user)}:${enc(parts.password)}@${parts.host}:${parts.port ?? 5432}/${enc(parts.database)}`;
}

/**
 * compose подставляет пароль роли в DATABASE_URL_* как есть — кодировать там нечем. Поэтому пароль, который
 * migrate ставит ролям входа, обязан состоять из URL-безопасных символов (RFC 3986 unreserved), иначе web и воркер
 * получат строку, которую нельзя разобрать. Отказ до ALTER ROLE, а не на старте web.
 */
export function assertUrlSafePassword(name: string, password: string): void {
  if (!/^[A-Za-z0-9._~-]+$/.test(password)) {
    throw new ConfigError(name, `${name} содержит символы, требующие URL-кодирования: compose подставляет его в `
      + 'DATABASE_URL_* без кодирования, и web/воркер не подключатся. Используйте openssl rand -hex 24');
  }
}

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
    case 'pg-url': {
      let url: URL;
      try { url = new URL(raw); } catch { throw bad('не URL подключения'); }
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw bad('не postgresql://-адрес');
      if (!url.hostname || !url.password) throw bad('без хоста или пароля');
      // Пароль и имя в строке подключения обязаны быть URL-кодированы (pgUrl). Кривая %-последовательность — отказ
      // конфигурации с именем переменной, а не URIError без него (08_review.md R-2). Значение не печатается.
      const user = decodeUrlPart(url.username);
      if (user === null || decodeUrlPart(url.password) === null) {
        throw bad('содержит некодированные символы в имени или пароле (соберите строку через pgUrl / encodeURIComponent)');
      }
      // Кабинет обязан входить ролью без доступа к n6b_service (08_review.md F-3): перепутанные строки подключения
      // молча вернули бы BYPASSRLS в каждый запрос кабинета. Сверяется имя пользователя, пароль не печатается.
      if (!spec.user || user !== spec.user) throw bad(`должен входить пользователем ${spec.user ?? '?'}`);
      return raw;
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
