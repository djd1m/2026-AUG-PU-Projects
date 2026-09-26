// Разбор multipart/form-data с ОДНИМ файлом (CreateSource п.2, FR-SOURCE-003). Написано заново: у N5
// загрузка шла напрямую в S3 по подписанной ссылке, разборщика тела не было (ADR-018 убрал S3).
// Тело — враждебный ввод (урок ревью crawler: ReDoS и квадратичный разбор — REJECT). Поэтому:
//  • ни одного регэкспа с вложенными или смежными квантификаторами; заголовки части — ручной сканер;
//  • каждый поиск идёт ВПЕРЁД от текущей позиции, ни одна позиция не пересматривается дважды;
//  • блок заголовков части ограничен 8 КиБ ДО поиска его конца (поиск не бежит по 10 МБ файла);
//  • ровно одна часть: вторая часть, пустое тело, преамбула — отказ, а не догадка.
export class MultipartError extends Error {
  constructor(message: string) { super(message); this.name = 'MultipartError'; }
}
export interface UploadedFile { fieldName: string; fileName: string; data: Buffer }

const MAX_HEADER_BLOCK = 8 * 1024;
const MAX_CONTENT_TYPE = 1024;
// RFC 2046 §5.1.1: bchars; 1–70 символов, не оканчивается пробелом.
const BCHARS = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'()+_,-./:=? ");

// Граница из Content-Type. null — не multipart/form-data или граница непригодна.
export function readBoundary(contentType: string | null): string | null {
  if (!contentType || contentType.length > MAX_CONTENT_TYPE) return null;
  const params = contentType.split(';');
  if (params[0]?.trim().toLowerCase() !== 'multipart/form-data') return null;
  let boundary: string | null = null;
  for (const raw of params.slice(1)) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    if (raw.slice(0, eq).trim().toLowerCase() !== 'boundary') continue;
    if (boundary !== null) return null; // две границы — неоднозначно
    let value = raw.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    boundary = value;
  }
  if (!boundary || boundary.length > 70 || boundary.endsWith(' ')) return null;
  for (const ch of boundary) if (!BCHARS.has(ch)) return null;
  return boundary;
}

// Параметры Content-Disposition: `form-data; name="file"; filename="прайс.pdf"`. Ручной сканер:
// позиция только растёт; значение в кавычках — до ближайшей закрывающей.
function dispositionParams(value: string): Map<string, string> | null {
  const semi = value.indexOf(';');
  if ((semi < 0 ? value : value.slice(0, semi)).trim().toLowerCase() !== 'form-data') return null;
  const params = new Map<string, string>();
  let i = semi < 0 ? value.length : semi + 1;
  while (i < value.length) {
    while (i < value.length && (value[i] === ' ' || value[i] === '\t' || value[i] === ';')) i++;
    if (i >= value.length) break;
    const eq = value.indexOf('=', i);
    if (eq < 0) return null;
    const key = value.slice(i, eq).trim().toLowerCase();
    i = eq + 1;
    let parsed: string;
    if (value[i] === '"') {
      // WHATWG «multipart/form-data encoding»: браузер кодирует « " » как %22 и не экранирует обратный
      // слеш — значение заканчивается на ближайшей кавычке (один indexOf вперёд).
      const close = value.indexOf('"', i + 1);
      if (close < 0) return null; // незакрытая кавычка — отказ, а не «до конца строки»
      parsed = value.slice(i + 1, close);
      i = close + 1;
    } else {
      const next = value.indexOf(';', i);
      const end = next < 0 ? value.length : next;
      parsed = value.slice(i, end).trim();
      i = end;
    }
    if (!key || params.has(key)) return null;
    params.set(key, parsed);
  }
  return params;
}

// filename* (RFC 5987) имеет приоритет; браузеры обычно шлют UTF-8 в filename="…".
function fileNameFrom(params: Map<string, string>): string | null {
  const extended = params.get('filename*');
  if (extended !== undefined) {
    const quote = extended.indexOf("''");
    if (quote < 0 || extended.slice(0, quote).toLowerCase() !== 'utf-8') return null;
    try { return decodeURIComponent(extended.slice(quote + 2)); } catch { return null; }
  }
  return params.get('filename') ?? null;
}

export function parseSingleFile(body: Buffer, boundary: string): UploadedFile {
  const opening = Buffer.from(`--${boundary}`, 'latin1');
  if (body.length < opening.length + 2 || !body.subarray(0, opening.length).equals(opening)) {
    throw new MultipartError('тело не начинается с границы');
  }
  let position = opening.length;
  if (body[position] !== 0x0d || body[position + 1] !== 0x0a) throw new MultipartError('нет ни одной части');
  position += 2;
  const window = body.subarray(position, Math.min(body.length, position + MAX_HEADER_BLOCK + 4));
  const headerEnd = window.indexOf('\r\n\r\n', 0, 'latin1');
  if (headerEnd < 0) throw new MultipartError('заголовки части не завершены или длиннее 8 КиБ');
  const headers = body.subarray(position, position + headerEnd).toString('utf8').split('\r\n');
  const dataStart = position + headerEnd + 4;
  let disposition: string | null = null;
  for (const line of headers) {
    const colon = line.indexOf(':');
    if (colon <= 0) throw new MultipartError('непригодный заголовок части');
    if (line.slice(0, colon).trim().toLowerCase() === 'content-disposition') {
      if (disposition !== null) throw new MultipartError('два Content-Disposition');
      disposition = line.slice(colon + 1).trim();
    }
  }
  const params = disposition === null ? null : dispositionParams(disposition);
  if (!params) throw new MultipartError('нет Content-Disposition: form-data');
  const fieldName = params.get('name');
  const fileName = fileNameFrom(params);
  if (!fieldName || fileName === null) throw new MultipartError('часть не является файлом');
  // Конец данных — ПЕРВОЕ вхождение CRLF--граница после начала данных; один проход indexOf.
  const closing = Buffer.from(`\r\n--${boundary}`, 'latin1');
  const dataEnd = body.indexOf(closing, dataStart);
  if (dataEnd < 0) throw new MultipartError('часть не завершена границей');
  const after = dataEnd + closing.length;
  if (body[after] !== 0x2d || body[after + 1] !== 0x2d) throw new MultipartError('ожидалась ровно одна часть');
  return { fieldName, fileName, data: body.subarray(dataStart, dataEnd) };
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// Имя файла — только подпись источника («прайс.pdf, с. 3»): без пути, управляющих символов и «#»
// (разделитель страницы в page.url_or_page), NFC, ≤ 120 символов с сохранением расширения.
export function sanitizeFileName(raw: string): string {
  const base = raw.slice(Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\')) + 1);
  let name = base.normalize('NFC').replace(CONTROL, '').split('#').join('_').trim();
  if (name === '.' || name === '..') name = '';
  const chars = [...name];
  if (chars.length > 120) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
    name = chars.slice(0, 120 - [...ext].length).join('') + ext;
  }
  return name || 'документ.pdf';
}
