// Выгрузка движений в CSV (пункт 5 из пяти пробелов, 16.09.2026).
//
// Формат выбран под то, ЧЕМ его будут открывать, а не под то, что короче писать:
//
//   • разделитель `;`, а не запятая. Русский Excel берёт разделителем символ из региональных
//     настроек, и для России это точка с запятой. Файл с запятыми открывается ОДНОЙ колонкой —
//     человек видит кашу вместо таблицы;
//   • BOM в начале. Без него Excel читает UTF-8 как ANSI, и кириллица превращается в «Ð¡Ð»;
//   • дробная часть через ЗАПЯТУЮ. С точкой русский Excel считает «478.65» текстом, и по
//     колонке нельзя взять сумму — то есть выгрузка бесполезна ровно там, ради чего делалась;
//   • поле с разделителем, кавычкой или переводом строки берётся в кавычки, кавычка внутри
//     удваивается (RFC 4180). Имя «ООО "Ромашка"; отдел» иначе разъезжается по колонкам.

export const CSV_BOM = '﻿';
const SEPARATOR = ';';

/** Экранирование по RFC 4180 с поправкой на выбранный разделитель. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Копейки → рубли с запятой: 47865 → «478,65». Отрицательные сохраняют знак. */
export function rublesCell(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Дата в виде, который Excel распознаёт как дату: ДД.ММ.ГГГГ по Москве. */
export function moscowDateCell(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function csvDocument(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [header.map(csvCell).join(SEPARATOR), ...rows.map((row) => row.map(csvCell).join(SEPARATOR))];
  // CRLF — то, что Excel ожидает от CSV.
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** Имя файла с датой: иначе в «Загрузках» через месяц лежат десять `export.csv`. */
export function exportFileName(prefix: string, at: Date = new Date()): string {
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  return `${prefix}-${iso}.csv`;
}

export const COMMISSION_KIND_LABEL: Record<string, string> = {
  accrual: 'начисление',
  clawback: 'возврат',
  payout: 'выплата',
};
