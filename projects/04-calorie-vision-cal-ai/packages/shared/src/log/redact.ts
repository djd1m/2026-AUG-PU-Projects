// Редактор запрещённых значений в журнале (NFR-foundation-2, AC-foundation-16).
//
// Поле СОХРАНЯЕТСЯ и получает метку `[redacted]`. Удалять поле нельзя: исчезнувшее поле
// выглядит как «его и не было», и по журналу невозможно отличить «секрет не печатали»
// от «секрет не попал в объект вовсе».
//
// Два независимых механизма, и они нужны оба:
//   1) по ЗНАЧЕНИЮ — секрет, попавший в произвольное поле (ключ модели, токен бота,
//      сырой токен cookie), затирается, как бы поле ни называлось;
//   2) по ИМЕНИ поля — то, что запрещено логировать в принципе (полный адрес, cookie,
//      Authorization), затирается, даже если значение нам неизвестно.

export const REDACTED = '[redacted]';

/** Имена полей, запрещённые к печати ЦЕЛИКОМ. Список ЯВНЫЙ и живёт в коде. */
export const FORBIDDEN_FIELD_NAMES: readonly string[] = [
  'cookie',
  'set-cookie',
  'authorization',
  'anthropic_api_key',
  'telegram_bot_token',
  'cookie_token',
  'cookie_token_hash',
  'session_token',
  'ip',
  'ip_address',
  'remote_address',
  'x-forwarded-for',
  'password',
  'secret',
  's3_secret_key',
  's3_access_key',
];

const MAX_DEPTH = 6;

export interface RedactorOptions {
  /** Точные значения-секреты. Пустые и слишком короткие игнорируются: они совпали бы со всем. */
  readonly secrets?: readonly (string | undefined)[];
  readonly forbiddenFields?: readonly string[];
  /**
   * ЗАКРЫТЫЙ список полей, которым разрешено попасть в журнал. Когда он задан, всё
   * ОСТАЛЬНОЕ затирается — это разворот правила с «запрещено перечисленное» на
   * «разрешено перечисленное».
   *
   * Заслужено слепым ревью (RV-foundation-01): обработчик ошибки писал в поле `route`
   * пользовательскую строку целиком, вместе с query, и туда уехали токен и полный адрес.
   * Чёрный список этого поймать не мог по построению: имя поля было разрешённым, а
   * опасным оказалось ЗНАЧЕНИЕ произвольной формы. Список запрещённых значений всегда
   * неполон — список разрешённых полей конечен и виден целиком.
   */
  readonly allowedFields?: readonly string[];
}

export function createRedactor(options: RedactorOptions = {}): (value: unknown) => unknown {
  const secrets = (options.secrets ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length >= 8);
  const forbidden = new Set((options.forbiddenFields ?? FORBIDDEN_FIELD_NAMES).map((n) => n.toLowerCase()));
  const allowed = options.allowedFields === undefined ? undefined : new Set(options.allowedFields.map((n) => n.toLowerCase()));

  const redactString = (text: string): string => {
    let result = text;
    for (const secret of secrets) {
      if (result.includes(secret)) result = result.split(secret).join(REDACTED);
    }
    return result;
  };

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return REDACTED;
    if (typeof value === 'string') return redactString(value);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
    if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const name = key.toLowerCase();
      // Порядок проверок: сначала запрет (он безусловен), затем разрешение. Поле, которого
      // нет в списке разрешённых, затирается, НО СОХРАНЯЕТСЯ: исчезнувшее поле выглядит
      // как «его и не было», и по журналу не отличить «не печатали» от «не попало».
      if (forbidden.has(name)) output[key] = REDACTED;
      else if (allowed !== undefined && !allowed.has(name)) output[key] = REDACTED;
      else output[key] = walk(item, depth + 1);
    }
    return output;
  };

  return (value: unknown) => walk(value, 0);
}
