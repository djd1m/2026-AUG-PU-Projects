// Валидация окружения fail-closed (FR-foundation-2).
//
// Правило одно и оно безусловное: ОТСУТСТВУЮЩЕЕ, ПУСТОЕ и НЕРАСПОЗНАННОЕ значение —
// это ОТКАЗ, а не «ограничений нет» и не «возьмём разумное умолчание»
// (`honest-configuration` CFG-S1, CFG-I1, CFG-I2, CFG-I3; `silent-fallbacks`).
//
// `undefined` (переменной нет) и `''` (переменная есть и пуста) различаются НАМЕРЕННО:
// второе почти всегда опечатка в `.env`, и слитое с первым оно теряет диагностику
// (`fail-closed-defaults`, п. 2).
//
// Ни одна функция этого файла не читает `process.env`: чтение живёт в `apps/*/src/env.ts`,
// по одному месту на сервис. Иначе страж `scripts/check-env-wiring.sh` приписал бы
// переменные общего пакета КАЖДОМУ сервису и начал давать ложные потери.

/** Отказ конфигурации: названа переменная и её ВНЕШНЕЕ последствие, а не только факт. */
export class ConfigError extends Error {
  readonly variable: string;
  readonly consequence: string;
  readonly kind: 'missing' | 'empty' | 'invalid';

  constructor(variable: string, kind: 'missing' | 'empty' | 'invalid', consequence: string, detail?: string) {
    const reason =
      kind === 'missing' ? 'не задана' : kind === 'empty' ? 'задана пустой строкой' : `непригодна${detail ? ` (${detail})` : ''}`;
    super(`${variable} ${reason}. Последствие: ${consequence}`);
    this.name = 'ConfigError';
    this.variable = variable;
    this.consequence = consequence;
    this.kind = kind;
  }
}

/** Несколько отказов сразу: один прогон называет ВСЕ незакрытые переменные, а не первую. */
export class ConfigValidationError extends Error {
  readonly errors: readonly ConfigError[];

  constructor(errors: readonly ConfigError[]) {
    super(`Конфигурация не прошла проверку, не открыт ни один сокет:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }

  /** Имена переменных, из-за которых отказано. Тесту нужно именно это множество. */
  get variables(): string[] {
    return this.errors.map((e) => e.variable);
  }
}

function present(name: string, raw: string | undefined, consequence: string): string {
  if (raw === undefined) throw new ConfigError(name, 'missing', consequence);
  const trimmed = raw.trim();
  if (trimmed === '') throw new ConfigError(name, 'empty', consequence);
  return trimmed;
}

/** Непустая строка. Ничего не подчищает и ничего не подставляет. */
export function requireText(name: string, raw: string | undefined, consequence: string): string {
  return present(name, raw, consequence);
}

/**
 * Целое СТРОГО больше нуля. `0` здесь не «запретить всё», а несконфигурированный потолок:
 * значение, которое никогда не было настроено, не имеет права выглядеть как настроенное.
 */
export function requirePositiveInt(name: string, raw: string | undefined, consequence: string): number {
  const value = present(name, raw, consequence);
  if (!/^[0-9]+$/.test(value)) throw new ConfigError(name, 'invalid', consequence, `ожидалось целое число, получено ${JSON.stringify(value)}`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(name, 'invalid', consequence, `ожидалось целое больше нуля, получено ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * Внешний адрес. ПРОВЕРЯЕТСЯ конструктором URL и закрытым списком схем, а НЕ подчищается:
 * срезание хвостового слеша однажды превратило `/` в пустую строку и уронило каждый
 * `new URL(path, base)` (`fail-closed-defaults`, п. 4).
 */
export function requireOrigin(name: string, raw: string | undefined, consequence: string): string {
  const value = present(name, raw, consequence);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(name, 'invalid', consequence, `не разбирается как абсолютный URL: ${JSON.stringify(value)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(name, 'invalid', consequence, `схема ${url.protocol} не разрешена, ожидалось http: или https:`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new ConfigError(name, 'invalid', consequence, 'ожидался origin без пути, запроса и якоря');
  }
  return url.origin;
}

/**
 * Выбор из ЗАКРЫТОГО множества, которое живёт в КОДЕ; окружение только выбирает вариант
 * (`honest-configuration` CFG-I8). Регистр не сворачивается: `Fake` — это опечатка,
 * а опечатка в выборе реализации обязана валить старт, а не молча откатываться к дешёвой.
 */
export function requireEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  consequence: string,
): T {
  const value = present(name, raw, consequence);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ConfigError(name, 'invalid', consequence, `распознаются только ${allowed.join(' | ')}, получено ${JSON.stringify(value)}`);
  }
  return value as T;
}

/**
 * Значение, законно отсутствующее. Возвращает `undefined` и для отсутствующей переменной,
 * и для пустой строки — но ТОЛЬКО там, где отсутствие названо законным явно (пример:
 * `ANTHROPIC_API_KEY` при `N4_MODEL_PROVIDER=fake`). Обязательность проверяет вызывающий.
 */
export function optionalText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Собирает ВСЕ отказы разом. Прогон, называющий первую же переменную, заставляет чинить
 * конфигурацию по одной ошибке за запуск; здесь список полон с первого раза.
 */
export function collectConfig<T>(build: (fail: (error: unknown) => void) => T): T {
  const errors: ConfigError[] = [];
  const value = build((error) => {
    if (error instanceof ConfigError) errors.push(error);
    else throw error;
  });
  if (errors.length > 0) throw new ConfigValidationError(errors);
  return value;
}

/** Обёртка: выполняет проверку и передаёт её отказ в накопитель `collectConfig`. */
export function attempt<T>(fail: (error: unknown) => void, read: () => T, fallback: T): T {
  try {
    return read();
  } catch (error) {
    fail(error);
    return fallback;
  }
}
