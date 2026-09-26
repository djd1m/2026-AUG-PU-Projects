// Фикстуры PDF, собранные в тесте (фича pdf-source): нормальный, многостраничный, скан без текста,
// шифрованный, битый, 101 страница и «PDF-бомбы». Каждый документ — настоящий PDF 1.4 с верной таблицей
// xref; текст — шрифт Helvetica с /Differences, отображающими байты 0xC0–0xFF на U+0410–U+044F (кириллица).
import { createDeflate } from 'node:zlib';

type Body = string | Buffer;
const bytes = (value: Body) => (Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1'));

// Объекты нумеруются с 1 в порядке массива; root — номер объекта каталога.
export function serialize(objects: Body[], root = 1, trailerExtra = ''): Buffer {
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), bytes(object), Buffer.from('\nendobj\n')]);
    offsets.push(offset);
    offset += chunk.length;
    parts.push(chunk);
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${root} 0 R${trailerExtra} >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
const stream = (content: Buffer, dict = '') => Buffer.concat([Buffer.from(`<< /Length ${content.length}${dict} >>\nstream\n`), content, Buffer.from('\nendstream')]);

// Кириллица → байты cp1251 в строке PDF; скобки и обратный слеш экранируются.
export function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const byte = code >= 0x410 && code <= 0x44f ? code - 0x410 + 0xc0 : code < 128 ? code : 0x3f;
    const c = String.fromCharCode(byte);
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return `(${out})`;
}
export const textPage = (lines: string[]) => `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `${pdfString(l)} Tj T*`).join(' ')} ET`;

export interface PageSpec { text?: string[]; raw?: Buffer | string }
export function buildPdf(pages: PageSpec[], options: { encrypt?: boolean } = {}): Buffer {
  const objects: Body[] = ['', ''];
  const diffs = Array.from({ length: 64 }, (_, i) => `/uni${(0x410 + i).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [192 ${diffs}] >> >>`);
  const kids: number[] = [];
  for (const page of pages) {
    objects.push(stream(bytes(page.raw ?? textPage(page.text ?? []))));
    const content = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    kids.push(objects.length);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let extra = '';
  if (options.encrypt) {
    // Стандартный обработчик RC4 40 бит с НЕПУСТЫМ паролем пользователя: без пароля документ не открыть.
    objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -44 >>`);
    extra = ` /Encrypt ${objects.length} 0 R /ID [<${'11'.repeat(16)}> <${'11'.repeat(16)}>]`;
  }
  return serialize(objects, 1, extra);
}

export const PRICE_LINES = ['Прайс-лист компании "Ромашка" 2026', 'Доставка по России от 350 руб.', 'Самовывоз бесплатно, склад в Казани'];
export const normalPdf = () => buildPdf([{ text: PRICE_LINES }]);
export const multiPagePdf = (n = 12) => buildPdf(Array.from({ length: n }, (_, i) => ({ text: [`Страница ${i + 1}: раздел прайса`, `Позиция ${i + 1} стоит ${100 * (i + 1)} руб.`] })));
// Скан: на страницах только графические операторы, текстового слоя нет.
export const scanPdf = (pages = 10, withText = 0) => buildPdf(Array.from({ length: pages }, (_, i) => (i < withText
  ? { text: [`Текстовая страница номер ${i + 1} с подписью`] } : { raw: 'q 612 0 0 792 0 0 cm 0.5 g 0 0 1 1 re f Q' })));
export const encryptedPdf = () => buildPdf([{ text: PRICE_LINES }], { encrypt: true });
export const brokenPdf = () => Buffer.from('%PDF-1.7\nэто не PDF: ни объектов, ни xref, ни trailer\n', 'utf8');
export const truncatedPdf = () => normalPdf().subarray(0, 40);

const catalogPages = (pageDict: string) => ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', pageDict];

// Бомба распаковки: поток содержимого FlateDecode, разжимающийся в `megabytes` МБ пробелов (≈ 1000 : 1).
export async function flateBombPdf(megabytes = 400): Promise<Buffer> {
  const deflate = createDeflate({ level: 9 });
  const chunks: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => { deflate.on('end', resolve); deflate.on('error', reject); });
  const megabyte = Buffer.alloc(1 << 20, 0x20);
  for (let i = 0; i < megabytes; i++) {
    if (!deflate.write(megabyte)) await new Promise<void>((resolve) => deflate.once('drain', resolve));
  }
  deflate.end();
  await done;
  const compressed = Buffer.concat(chunks);
  return serialize([...catalogPages('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'),
    stream(compressed, ' /Filter /FlateDecode')]);
}
// Глубокая вложенность массивов в словаре страницы: рекурсивный разбор объектов.
export const deepNestingPdf = (depth = 500_000) => serialize(catalogPages(
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /X ${'['.repeat(depth)}${']'.repeat(depth)} >>`));
// Экспоненциальный разворот: каждая форма рисует следующую ДВАЖДЫ — 2^levels вызовов при файле в несколько КБ.
export function fanOutFormsPdf(levels = 40): Buffer {
  const objects: Body[] = catalogPages(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /X 5 0 R >> >> /Contents 4 0 R >>`);
  objects.push(stream(Buffer.from('/X Do')));
  const font = 5 + levels;
  for (let i = 0; i < levels; i++) {
    const last = i === levels - 1;
    const content = Buffer.from(last ? 'BT /F1 12 Tf (ab) Tj ET' : '/X Do /X Do');
    const resources = last ? `/Resources << /Font << /F1 ${font} 0 R >> >>` : `/Resources << /XObject << /X ${6 + i} 0 R >> >>`;
    objects.push(stream(content, ` /Type /XObject /Subtype /Form /BBox [0 0 1 1] ${resources}`));
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  return serialize(objects);
}
// Глубокая цепочка вложенных форм (каждая рисует следующую): вложенные потоки.
export function nestedFormsPdf(depth = 20_000): Buffer {
  const objects: Body[] = catalogPages(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /X 5 0 R >> >> /Contents 4 0 R >>`);
  objects.push(stream(Buffer.from('/X Do')));
  for (let i = 0; i < depth; i++) {
    const last = i === depth - 1;
    objects.push(stream(Buffer.from(last ? 'BT ET' : '/X Do'), ` /Type /XObject /Subtype /Form /BBox [0 0 1 1]${last ? '' : ` /Resources << /XObject << /X ${6 + i} 0 R >> >>`}`));
  }
  return serialize(objects);
}
// Огромное число объектов (≈ 10 МБ таблицы xref и тел) при одной пустой странице.
export function manyObjectsPdf(count = 200_000): Buffer {
  const objects: Body[] = catalogPages('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>');
  for (let i = 0; i < count; i++) objects.push('<< /A 1 >>');
  return serialize(objects);
}
// Дерево страниц с циклом: узел Pages ссылается сам на себя.
export const pageTreeLoopPdf = () => serialize(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>']);
// Текст сверх потолка извлечения: 100 страниц × 500 строк × 50 символов = 2,5 млн символов при файле ≈ 3 МБ.
export const hugeTextPdf = () => buildPdf(Array.from({ length: 100 }, (_, p) => ({
  raw: `BT /F1 8 Tf 10 780 Td 1 TL ${Array.from({ length: 500 }, (_, l) => `(${String(p * 500 + l).padStart(8, '0')}${'x'.repeat(42)}) Tj T*`).join(' ')} ET`,
})));

// Тело multipart/form-data, как его шлёт браузер (FormData с одним файлом).
export const BOUNDARY = '----n6boundary7MA4YWxkTrZu0gW';
export function multipart(file: Buffer, fileName = 'прайс.pdf', field = 'file', boundary = BOUNDARY): Buffer {
  return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\n`
    + 'Content-Type: application/pdf\r\n\r\n', 'utf8'), file, Buffer.from(`\r\n--${boundary}--\r\n`)]);
}
