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
 *  4096 байт формы входа сюда не годятся: 500 строк по 2000 символов текста — это ~1,1 МБ.
 *  2 МиБ с запасом; соотношение с MAX_IMPORT_ROWS проверяется отдельным тестом, иначе
 *  предел строк недостижим и существует только на бумаге. */
export const MAX_IMPORT_BODY = 2 * 1024 * 1024;

export const IMPORT_SOURCE = 'import';

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
export function parseCsvRecords(raw: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { pushField(); records.push(record); record = []; };

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
    if (ch === '\r') { i += 1; continue; }               // CRLF и CR одинаково
    if (ch === '\n') { pushRecord(); i += 1; continue; }
    field += ch; i += 1;
  }
  // Последняя запись без завершающего перевода строки.
  if (field !== '' || record.length > 0) pushRecord();
  return records;
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

  const records = parseCsvRecords(raw, detectDelimiter(raw));
  if (records.length === 0) return { ok: false, error: 'файл пуст' };
  if (records.length === 1) return { ok: false, error: 'в файле только заголовок, строк нет' };

  const dataRows = records.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `строк ${dataRows.length}, предел ${MAX_IMPORT_ROWS} — разбейте файл` };
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
