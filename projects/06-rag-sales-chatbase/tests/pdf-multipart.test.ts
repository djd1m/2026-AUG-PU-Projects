// Разбор multipart с одним файлом (apps/web/src/server/multipart.ts) — враждебный ввод до 10 МБ. Урок ревью
// crawler (REJECT за ReDoS и квадратичный разбор): кроме поведения проверяется ВРЕМЯ на патологическом теле.
import { describe, expect, it } from 'vitest';
import { MultipartError, parseSingleFile, readBoundary, sanitizeFileName } from '../apps/web/src/server/multipart';
import { PDF_MAX_BYTES } from '../packages/rag/src/constants';

const B = 'XyZ123boundary';
const part = (headers: string, data: Buffer | string, boundary = B, tail = '--\r\n') =>
  Buffer.concat([Buffer.from(`--${boundary}\r\n${headers}\r\n\r\n`, 'utf8'), Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'),
    Buffer.from(`\r\n--${boundary}${tail}`, 'utf8')]);
const fileHeaders = (name = 'прайс.pdf') => `Content-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf`;
const elapsed = (run: () => unknown) => { const start = performance.now(); try { run(); } catch { /* отказ — тоже исход */ } return performance.now() - start; };

describe('readBoundary', () => {
  it.each([
    ['multipart/form-data; boundary=abc', 'abc'],
    ['Multipart/Form-Data; charset=utf-8; boundary="a b(c)"', 'a b(c)'],
    [`multipart/form-data; boundary=${'x'.repeat(70)}`, 'x'.repeat(70)],
  ])('%s → %s', (header, boundary) => expect(readBoundary(header)).toBe(boundary));
  it.each([
    null, '', 'application/json', 'multipart/mixed; boundary=abc', 'multipart/form-data', 'multipart/form-data; boundary=',
    `multipart/form-data; boundary=${'x'.repeat(71)}`, 'multipart/form-data; boundary="abc "', 'multipart/form-data; boundary=a<b',
    'multipart/form-data; boundary=a; boundary=b', `multipart/form-data; boundary=abc; x=${'y'.repeat(1100)}`,
  ])('%s → null', (header) => expect(readBoundary(header)).toBeNull());
});

describe('parseSingleFile', () => {
  it('один файл: имя поля, имя файла, байты без обрамления', () => {
    const file = parseSingleFile(part(fileHeaders(), '%PDF-1.4 данные\r\n--почти граница'), B);
    expect(file).toMatchObject({ fieldName: 'file', fileName: 'прайс.pdf' });
    expect(file.data.toString('utf8')).toBe('%PDF-1.4 данные\r\n--почти граница');
  });
  it('filename* (RFC 5987) в приоритете; обратный слеш — не экранирование (как шлёт браузер)', () => {
    expect(parseSingleFile(part(`Content-Disposition: form-data; name="file"; filename="a.pdf"; filename*=UTF-8''%D0%BF%D1%80%D0%B0%D0%B9%D1%81.pdf`, 'x'), B).fileName).toBe('прайс.pdf');
    expect(parseSingleFile(part(fileHeaders('C:\\dir\\a.pdf'), 'x'), B).fileName).toBe('C:\\dir\\a.pdf');
  });
  it.each([
    ['преамбула до первой границы', Buffer.concat([Buffer.from('preamble\r\n'), part(fileHeaders(), 'x')])],
    ['нет частей', Buffer.from(`--${B}--\r\n`)],
    ['часть не завершена границей', Buffer.from(`--${B}\r\n${fileHeaders()}\r\n\r\n%PDF-1.4 и обрыв`)],
    ['заголовки части длиннее 8 КиБ', part(`${fileHeaders()}\r\nX-Pad: ${'a'.repeat(9000)}`, 'x')],
    ['поле без имени файла', part('Content-Disposition: form-data; name="file"', 'x')],
    ['не form-data', part('Content-Disposition: attachment; name="file"; filename="a.pdf"', 'x')],
    ['незакрытая кавычка', part('Content-Disposition: form-data; name="file"; filename="a.pdf', 'x')],
    ['дважды один параметр', part('Content-Disposition: form-data; name="file"; name="x"; filename="a.pdf"', 'x')],
    ['два Content-Disposition', part(`${fileHeaders()}\r\nContent-Disposition: form-data; name="x"; filename="b.pdf"`, 'x')],
    ['заголовок без двоеточия', part(`${fileHeaders()}\r\nbroken`, 'x')],
    ['вторая часть', part(fileHeaders(), 'x', B, `\r\n${fileHeaders()}\r\n\r\ny\r\n--${B}--`)],
    ['filename* не UTF-8', part(`Content-Disposition: form-data; name="file"; filename*=koi8-r''abc`, 'x')],
    ['filename* с битым процентом', part(`Content-Disposition: form-data; name="file"; filename*=UTF-8''%E0%A4%A`, 'x')],
  ])('%s → MultipartError', (_t, body) => expect(() => parseSingleFile(body, B)).toThrow(MultipartError));
});

describe('sanitizeFileName', () => {
  it.each([
    ['C:\\Users\\me\\прайс.pdf', 'прайс.pdf'],
    ['../../etc/passwd', 'passwd'],
    ['прайс#2026.pdf', 'прайс_2026.pdf'],
    ['a\u0000b\u001fc\u007f.pdf', 'abc.pdf'],
    ['  ', 'документ.pdf'],
    ['..', 'документ.pdf'],
    ['/', 'документ.pdf'],
    ['е\u0301ж.pdf', 'éж.pdf'.replace('é', 'е\u0301'.normalize('NFC'))],
  ])('%j → %j', (raw, expected) => expect(sanitizeFileName(raw)).toBe(expected));
  it('длинное имя обрезается до 120 символов с сохранением расширения', () => {
    const name = sanitizeFileName(`${'п'.repeat(300)}.pdf`);
    expect([...name]).toHaveLength(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

// Время на патологическом теле размером с потолок: разбор линеен — десятки миллисекунд, порог 1 с.
describe('parseSingleFile: патологическое тело укладывается во время', () => {
  const SIZE = PDF_MAX_BYTES;
  const LIMIT_MS = 1000;
  it('10 МБ «почти-границ» (CRLF--граница с отличием в последнем символе)', () => {
    const boundary = 'a'.repeat(70);
    const nearMiss = `\r\n--${'a'.repeat(69)}b`;
    const data = Buffer.from(nearMiss.repeat(Math.floor(SIZE / nearMiss.length)), 'latin1');
    const body = part(fileHeaders(), data, boundary);
    let parsed = 0;
    expect(elapsed(() => { parsed = parseSingleFile(body, boundary).data.length; })).toBeLessThan(LIMIT_MS);
    expect(parsed).toBe(data.length);
  });
  it('10 МБ одного символа границы при границе из 70 таких же символов', () => {
    const boundary = 'a'.repeat(70);
    const body = part(fileHeaders(), Buffer.alloc(SIZE, 0x61), boundary);
    expect(elapsed(() => parseSingleFile(body, boundary))).toBeLessThan(LIMIT_MS);
  });
  it('10 МБ без конца заголовков части (поиск ограничен 8 КиБ окна)', () => {
    const body = Buffer.concat([Buffer.from(`--${B}\r\n`), Buffer.alloc(SIZE, 0x3b)]);
    expect(elapsed(() => parseSingleFile(body, B))).toBeLessThan(50);
    expect(() => parseSingleFile(body, B)).toThrow(MultipartError);
  });
  it('10 МБ без завершающей границы — один проход до конца и отказ', () => {
    const body = Buffer.concat([Buffer.from(`--${B}\r\n${fileHeaders()}\r\n\r\n`), Buffer.alloc(SIZE, 0x0d)]);
    expect(elapsed(() => parseSingleFile(body, B))).toBeLessThan(LIMIT_MS);
  });
  it('8 КиБ заголовка из «;» и кавычек — разбор параметров линеен', () => {
    const heavy = `Content-Disposition: form-data; name="file"; filename="a.pdf"${'; x="'.repeat(1500)}`;
    expect(elapsed(() => parseSingleFile(part(heavy, 'x'), B))).toBeLessThan(50);
  });
});
