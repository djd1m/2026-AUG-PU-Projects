// FR-014 — импорт отзывов из CSV.
//
// ─────────────────────────────────────────────────────────────────────────────
// НЕСУЩЕЕ: ИМПОРТ НЕ ДОЛЖЕН СТАТЬ ВТОРОЙ ДВЕРЬЮ.
//
// Текст отзыва рендерится НА ЧУЖИХ САЙТАХ через виджет. Всё, что защищает этот путь,
// живёт в одной функции — validateTextSubmission, — и она сегодня единственная дверь.
// Импорт добавляет вторую.
//
// Класс известен проекту дословно: ревью нашло L-2 — «у входа предел тела был, у
// регистрации нет, закрытой оставалась одна дверь из двух». Здесь цена ошибки выше: там
// утекала нагрузка, здесь на чужие сайты уедет чужой контент.
//
// Поэтому импортируемая строка проходит РОВНО ту же функцию. Не «аналогичную», не «свою
// для импорта». Своих проверок длины в этом файле нет, и страж по исходнику это стережёт.
//
// ИДЕМПОТЕНТНОСТЬ — ОГРАНИЧЕНИЕМ БД, А НЕ ПРОВЕРКОЙ ПЕРЕД ВСТАВКОЙ. Проверка оставляет
// окно между чтением и записью: при двух одновременных импортах одного файла оба увидят
// «такой строки нет» и вставят обе. В проекте это решено так уже дважды.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { validateTextSubmission } from './testimonial';

/** Один импорт. 500 вставок в одной транзакции — доли секунды; выше это уже пакетная
 *  задача, а не форма. Число названо, потому что «разумное значение» непроверяемо. */
export const MAX_IMPORT_ROWS = 500;

/** Предел тела ИМПОРТА — свой, и это не нарушение правила единственности: правило требует
 *  одной РЕАЛИЗАЦИИ предела (readBodyAtMost), а не одного значения на все маршруты.
 *  4096 байт формы входа сюда не годятся.
 *
 *  ЧИСЛО ВЫВЕДЕНО, А НЕ ВЫБРАНО, и считается В БАЙТАХ на языке продукта:
 *
 *      (NAME_MAX 80 + TEXT_MAX 2000 + ROLE_MAX 120) символов кириллицы
 *        × 2 байта на символ в UTF-8  +  3 разделителя и перевод строки
 *        = 4403 байта на строку
 *      × MAX_IMPORT_ROWS 500 = 2 201 500 байт
 *
 *  Прежнее значение 2 МиБ (2 097 152) было МАЛО: не хватало 104 348 байт, и предел строк
 *  был недостижим — до него дело не дошло бы никогда, сработал бы 413, и сообщение было бы
 *  о размере, а не о числе строк. Тест соотношения при этом зеленел, потому что считал в
 *  СИМВОЛАХ, а сравнивал с пределом в БАЙТАХ: для кириллицы расхождение ровно вдвое.
 *
 *  3 МиБ — с запасом на обёртку JSON и экранирование переводов строки. Цену разбора это не
 *  увеличивает: он прекращается на MAX_IMPORT_ROWS + 1 записи, то есть ограничен числом
 *  строк, а не размером файла. */
export const MAX_IMPORT_BODY = 3 * 1024 * 1024;

export const IMPORT_SOURCE = 'import';

/** Ограничение частоты САМОГО импорта. Маршрут пишет в БД и жжёт процессор — он ничем не
 *  невиннее публичной формы отзыва, которая ограничена 5/час. Закрытой снова оказалась одна
 *  дверь из двух, и снова та, что дороже.
 *
 *  Ключ по ВЛАДЕЛЬЦУ, а не по адресу: за одним NAT сидят разные владельцы. 20 импортов в
 *  час — с большим запасом над живым сценарием (импорт делают раз в жизни проекта, изредка
 *  повторяют) и на порядок ниже вредного. */
export const IMPORT_RATE_SCOPE = 'csv_import';
export const IMPORT_RATE_THRESHOLD = 20;
export const IMPORT_RATE_WINDOW = { seconds: 3600 } as const;

export interface ColumnMapping { name: number; text: number; role?: number | null }
export interface ImportRow { name: string; text: string; role: string | null }
export interface RejectedRow { line: number; errors: string[] }

export type ParseResult =
  | { ok: true; rows: ImportRow[]; rejected: RejectedRow[] }
  | { ok: false; error: string };

/**
 * Разбор по RFC 4180: кавычки, удвоенная кавычка как экранирование, разделитель и перевод
 * строки ВНУТРИ поля.
 *
 * Написан здесь, а не взят зависимостью: формат маленький и полностью проверяемый, а новая
 * зависимость — это цепочка поставки ради шестидесяти строк. Наивный split(',') при этом
 * недопустим: он молча съест половину отзывов и не скажет об этом.
 */
export class TooManyRecordsError extends Error {
  constructor(readonly limit: number) {
    super(`строк больше ${limit}`);
    this.name = 'TooManyRecordsError';
  }
}

/**
 * `maxRecords` — не удобство, а ГРАНИЦА ЦЕНЫ.
 *
 * Прежде предел строк проверялся ПОСЛЕ полного разбора, и потому ограничивал сообщение, а
 * не ресурс: цена определялась размером файла, а не числом строк. Замерено ревью на теле
 * ровно в пределе 2 МиБ: 294 мс СИНХРОННОЙ работы и +217 МиБ heap на один запрос, при том
 * что соседний запрос к БД в норме занимает 0,8 мс.
 *
 * Синхронной — значит, что пока идёт цикл, процесс не обслуживает НИКОГО: ни витрину, ни
 * виджет, ни форму приёма, ни вход. Реплика web одна, поток в Node один. Один аккаунт
 * четырьмя запросами в секунду останавливал бы продукт целиком.
 *
 * Теперь разбор прекращается на первой записи сверх предела, и цена ограничена числом
 * строк — то есть тем же числом, о котором говорит сообщение.
 */
export function parseCsvRecords(raw: string, delimiter: string, maxRecords?: number): string[][] {
  // BOM Excel ставит при каждом сохранении в CSV. Сопоставление колонок идёт по номеру, а
  // заголовок пропускается, поэтому вреда он не наносит — но и оставлять его незачем.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => {
    pushField(); records.push(record); record = [];
    // +1 к пределу: заголовок занимает первую запись. Прекращаем СРАЗУ, не дочитывая.
    if (maxRecords !== undefined && records.length > maxRecords + 1) {
      throw new TooManyRecordsError(maxRecords);
    }
  };

  while (i < raw.length) {
    const ch = raw[i]!;
    if (inQuotes) {
      if (ch === '"') {
        // Удвоенная кавычка внутри кавычек — это одна кавычка, а не конец поля.
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (ch === delimiter) { pushField(); i += 1; continue; }
    if (ch === '\r') {
      // ОДИНОКИЙ \r — тоже конец записи, а не мусор. Пропуск его молча склеивал заголовок с
      // первой строкой: `name,text\rАнна,текст` давал ОДНУ запись ["name","textАнна",…].
      // Это тихая порча данных, найденная зондом на злых входах, а не рассуждением.
      if (raw[i + 1] === '\n') i += 1;                  // CRLF — один разделитель, не два
      pushRecord(); i += 1; continue;
    }
    if (ch === '\n') { pushRecord(); i += 1; continue; }
    field += ch; i += 1;
  }
  // Последняя запись без завершающего перевода строки.
  if (field !== '' || record.length > 0) pushRecord();
  // Незакрытая кавычка: остаток файла ушёл в одно поле. Без этой пометки строка просто не
  // прошла бы валидацию («текст пуст»), и владелец получил бы отказ с неверной причиной.
  if (inQuotes) throw new UnclosedQuoteError();
  return records;
}

export class UnclosedQuoteError extends Error {
  constructor() { super('в файле есть незакрытая кавычка'); this.name = 'UnclosedQuoteError'; }
}

/** Разделитель определяется по ПЕРВОЙ строке и только вне кавычек: заголовок вида
 *  "имя; должность",текст иначе был бы разобран как точка с запятой. */
export function detectDelimiter(raw: string): string {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (ch === '\n') break;
    if (ch === ',') commas += 1;
    if (ch === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Отпечаток строки для идемпотентности.
 *
 * Нормализация обязательна: строки, отличающиеся только пробелами по краям, — одна и та же
 * строка, и повторная выгрузка того же файла не должна создавать дубль.
 *
 * Разделитель-ноль обязателен: без него name="ab", text="c" и name="a", text="bc" дали бы
 * один отпечаток. Тот же довод, что у hashKey в login.ts.
 */
export function importFingerprint(authorName: string, text: string): string {
  return createHash('sha256')
    .update(`${authorName.trim()}\x00${text.trim()}`)
    .digest('hex');
}

/** Проверка кодировки: неверные байты дают отказ, а не порчу текста в БД. */
function isValidUtf8(raw: string): boolean {
  // Строка уже декодирована; символ замены появляется ровно там, где байты были негодны.
  return !raw.includes('\uFFFD');
}

/**
 * Разбор и валидация. НИЧЕГО не пишет и не имеет доступа к client — «предпросмотр не
 * пишет» здесь свойство сигнатуры, а не флаг. Флаг однажды передадут неверно.
 */
export function parseCsv(raw: string, mapping: ColumnMapping): ParseResult {
  if (!isValidUtf8(raw)) return { ok: false, error: 'файл не в кодировке UTF-8' };

  let records: string[][];
  try {
    records = parseCsvRecords(raw, detectDelimiter(raw), MAX_IMPORT_ROWS);
  } catch (err) {
    if (err instanceof TooManyRecordsError) {
      return { ok: false, error: `строк больше ${MAX_IMPORT_ROWS} — разбейте файл` };
    }
    if (err instanceof UnclosedQuoteError) {
      return { ok: false, error: 'в файле есть незакрытая кавычка — проверьте выгрузку' };
    }
    throw err;
  }
  if (records.length === 0) return { ok: false, error: 'файл пуст' };
  if (records.length === 1) return { ok: false, error: 'в файле только заголовок, строк нет' };

  // Пояс: разбор уже прекращается на превышении, но проверка остаётся — она дешёвая, а
  // страж обязан быть и на случай вызова parseCsvRecords без предела.
  const dataRows = records.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `строк больше ${MAX_IMPORT_ROWS} — разбейте файл` };
  }

  const rows: ImportRow[] = [];
  const rejected: RejectedRow[] = [];

  dataRows.forEach((record, index) => {
    const name = record[mapping.name] ?? '';
    const text = record[mapping.text] ?? '';
    const roleRaw = mapping.role === undefined || mapping.role === null
      ? null
      : record[mapping.role] ?? null;

    // ТА ЖЕ функция, что у формы. Своих проверок длины здесь нет и быть не должно.
    const errors = validateTextSubmission({ type: 'text', name, text, role: roleRaw ?? undefined });
    // +2: заголовок занимает первую строку, а нумерация для человека начинается с единицы.
    if (errors.length > 0) rejected.push({ line: index + 2, errors });
    else rows.push({ name, text, role: roleRaw && roleRaw.trim() !== '' ? roleRaw : null });
  });

  return { ok: true, rows, rejected };
}

/**
 * Запись. Отдельная функция с доступом к client — предпросмотр её не вызывает и вызвать
 * не может.
 *
 * Возвращает число ФАКТИЧЕСКИ вставленных: повторный импорт того же содержимого даёт 0 и
 * не падает, потому что дубль отсекает ограничение БД, а не проверка в коде.
 */
export async function importRows(
  client: PoolClient,
  projectId: string,
  rows: ImportRow[],
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    const { rowCount } = await client.query(
      `insert into testimonials
         (project_id, author_name, author_role, text, status, source, import_fingerprint)
       values ($1, $2, $3, $4, 'pending', $5, $6)
       on conflict (project_id, import_fingerprint) do nothing`,
      [projectId, row.name, row.role, row.text, IMPORT_SOURCE,
       importFingerprint(row.name, row.text)],
    );
    if (rowCount === 1) inserted += 1;
  }
  return inserted;
}
