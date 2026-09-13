// RecordProInterest (фича `pro-interest-and-limits-ui`, `02_pseudocode.md`,
// FR-pro-interest-and-limits-ui-7/8, маршрут 10 канона).
//
// Порядок шагов НЕ переставляется (`security-operation-order.md`): закрытый набор
// `source` проверяется ПЕРВЫМ, затем форма контакта — ОБЕ проверки ДО cadence-проверки.
// Мусорный запрос (неизвестный `source` или нераспознанный контакт) не имеет права занять
// место единственной разрешённой записи за сутки и потому не открывает транзакцию вовсе.
//
// Cadence — «прочитать, потом записать» здесь запрещено ТОЧНО так же, как в
// `consumeQuotaInTransaction`: два одновременных первых запроса одного `owner_key` не
// имеют права создать по строке каждый. В `pro_interest` нет уникального индекса
// `(owner_key, day)` (СХЕМУ фича не меняет — `03_architecture.md`), поэтому `INSERT …
// ON CONFLICT` недоступен; сериализация — `pg_advisory_xact_lock` по хэшу
// `(owner_key, day)`, снятому автоматически при COMMIT/ROLLBACK транзакции. Конкурентный
// тест — `tests/concurrency/interest-cadence.test.ts` (AC-pro-interest-and-limits-ui-8).

import { withTransaction, type DbPool } from '@n4/db';
import {
  classifyContact,
  PRO_INTEREST_SOURCE_SCREENS,
  type ProInterestContactKind,
  type ProInterestSourceScreen,
} from '@n4/shared';

export type RecordProInterestOutcome =
  | { readonly outcome: 'recorded'; readonly contactKind: ProInterestContactKind }
  | { readonly outcome: 'invalid_source' }
  | { readonly outcome: 'invalid_contact' }
  | { readonly outcome: 'already_recorded' };

export interface RecordProInterestInput {
  /** Канонический владелец: `account.id`, если сессия связана, иначе `device_session.id`. */
  readonly ownerKey: string;
  /** Атрибуция (`attribution`) ключуется устройством, а не владельцем (см. модуль ниже). */
  readonly deviceSessionId: string;
  readonly contact: string;
  readonly source: string;
  /** Календарные сутки `Europe/Moscow`, `YYYY-MM-DD` (`moscowDay()`). */
  readonly day: string;
}

function isSourceScreen(value: string): value is ProInterestSourceScreen {
  return (PRO_INTEREST_SOURCE_SCREENS as readonly string[]).includes(value);
}

/** Сигнал отказа ИЗНУТРИ транзакции — обязан быть исключением, а не значением: штатный
 * возврат из колбэка `withTransaction` её КОММИТИТ (`security-operation-order.md`). */
class AlreadyRecordedToday extends Error {}

const LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`;

// `(created_at AT TIME ZONE 'Europe/Moscow')::date` — тот же перевод в московские сутки,
// что и `moscowDay()` на стороне приложения, но вычисленный из уже сохранённой строки:
// день сравнивается со значением, переданным вызывающим, а не с `CURRENT_DATE` сервера
// (часовой пояс процесса БД не гарантирован).
const SELECT_EXISTING_TODAY_SQL = `
  SELECT id FROM pro_interest
  WHERE owner_key = $1 AND (created_at AT TIME ZONE 'Europe/Moscow')::date = $2::date
  FOR UPDATE
`;

// Атрибуция уникальна на УСТРОЙСТВО (`UNIQUE (device_session_id)`), а не на владельца:
// `owner_key` может быть аккаунтом, атрибуция всё равно ищется по сессии, которой пришёл
// именно этот запрос. `rejected` — атрибуция, признанная недействительной (самореферал,
// заблокированный код, anti-fraud), и в счёт не идёт.
const SELECT_CURRENT_ATTRIBUTION_SQL = `
  SELECT partner_code_id FROM attribution WHERE device_session_id = $1 AND status <> 'rejected'
`;

const INSERT_PRO_INTEREST_SQL = `
  INSERT INTO pro_interest (owner_key, contact, contact_kind, source_screen, partner_code_id)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

export async function recordProInterest(pool: DbPool, input: RecordProInterestInput): Promise<RecordProInterestOutcome> {
  // Шаг 1: закрытый набор `source` — третье значение не изобретается.
  if (!isSourceScreen(input.source)) return { outcome: 'invalid_source' };

  // Шаг 2: форма контакта. Нераспознанное значение НЕ создаёт строку и не расходует
  // cadence — cadence-проверка (шаг 3) для него не выполняется вовсе.
  const classified = classifyContact(input.contact);
  if (classified.kind === 'unrecognized') return { outcome: 'invalid_contact' };

  try {
    return await withTransaction(pool, async (client) => {
      // Шаг 3: advisory-lock по (owner_key, day) СЕРИАЛИЗУЕТ два одновременных первых
      // запроса; `FOR UPDATE` на уже существующую строку дня дополнительно блокирует её
      // от параллельного чтения, хотя после lock конкуренции внутри одного (owner_key, day)
      // уже нет — вторая транзакция ждёт снятия lock и видит строку первой.
      await client.query(LOCK_SQL, [`${input.ownerKey}:${input.day}`]);

      const existing = await client.query(SELECT_EXISTING_TODAY_SQL, [input.ownerKey, input.day]);
      if ((existing.rowCount ?? 0) > 0) throw new AlreadyRecordedToday();

      const attribution = await client.query<{ partner_code_id: string }>(SELECT_CURRENT_ATTRIBUTION_SQL, [
        input.deviceSessionId,
      ]);
      const partnerCodeId = attribution.rows[0]?.partner_code_id ?? null;

      // Шаг 5: запись — измерение спроса, не предзаказ (шаг 6): ничего в `account` или
      // `attribution` этим INSERT'ом не меняется.
      await client.query(INSERT_PRO_INTEREST_SQL, [
        input.ownerKey,
        classified.normalized,
        classified.kind,
        input.source,
        partnerCodeId,
      ]);

      return { outcome: 'recorded' as const, contactKind: classified.kind };
    });
  } catch (error) {
    if (error instanceof AlreadyRecordedToday) return { outcome: 'already_recorded' };
    throw error;
  }
}
