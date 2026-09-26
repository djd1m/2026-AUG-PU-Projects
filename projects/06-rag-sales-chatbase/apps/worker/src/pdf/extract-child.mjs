// Дочерний процесс разбора PDF (ExtractPdf п.1–2, FR-SOURCE-003). Написано заново (нет в донорах, ADR-016).
// Запускается ТОЛЬКО из extract-pdf.ts: байты документа приходят в stdin, результат — ОДНА строка JSON в
// stdout. Процесс не знает ни пути к файлу, ни секретов (окружение пустое), ни БД. Жёсткие пределы —
// снаружи: таймаут и замер резидентной памяти делает родитель и убивает процесс SIGKILL; здесь — только
// число страниц (до извлечения текста) и объём текста (обрыв сразу по превышении).
// Файл — .mjs, а не .ts: pdfjs-dist — ESM, а процесс запускается `node <файл>` без сборщика; сборка
// воркера копирует его в dist/pdf рядом с extract-pdf.js.
import Module from 'node:module';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Нативный @napi-rs/canvas (необязательная зависимость pdfjs) нужен только для отрисовки. Его загрузка —
// лишняя нативная поверхность на враждебном вводе, поэтому она запрещена здесь явно, даже если пакет
// установлен (в образе он удалён — Dockerfile).
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (String(request).includes('@napi-rs/canvas')) throw new Error('нативная отрисовка запрещена в разборе PDF');
  return originalLoad.call(this, request, ...rest);
};
// Предупреждения pdfjs идут в console.*: stdout принадлежит протоколу, всё прочее — в stderr.
const toStderr = (...args) => { process.stderr.write(args.map(String).join(' ').slice(0, 500) + '\n'); };
console.log = console.info = console.warn = console.debug = toStderr;
// Внутренние отклонённые промисы pdfjs на битом документе не должны ронять процесс раньше итога.
process.on('unhandledRejection', () => {});

const MAX_PAGES = Number(process.argv[2]);
const MAX_TEXT_CHARS = Number(process.argv[3]);
const MAX_INPUT_BYTES = Number(process.argv[4]);

function finish(result) {
  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0));
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) return null;
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks, size));
}

// Текст страницы: элементы pdfjs + переводы строк; пробельные серии схлопываются. Регэкспы — одиночные
// классы символов с квантификатором, без вложенности: линейны.
function pageText(items) {
  let text = '';
  for (const item of items) {
    if (typeof item.str === 'string') text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.replace(/[ \t \f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function classify(error) {
  const name = error && typeof error === 'object' ? String(error.name) : '';
  const message = error && typeof error === 'object' ? String(error.message) : '';
  if (name === 'PasswordException') return 'pdf_encrypted';
  if (message.includes('Maximum call stack size exceeded')) return 'pdf_too_complex';
  return 'pdf_invalid';
}

async function main() {
  if (![MAX_PAGES, MAX_TEXT_CHARS, MAX_INPUT_BYTES].every((n) => Number.isSafeInteger(n) && n > 0)) return finish({ ok: false, code: 'pdf_bad_arguments' });
  const data = await readInput();
  if (!data) return finish({ ok: false, code: 'pdf_too_many_bytes' });
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('pdfjs-dist/package.json'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let document;
  try {
    document = await getDocument({
      data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false,
      disableAutoFetch: true, disableStream: true, enableXfa: false, verbosity: 0,
      cMapUrl: join(root, 'cmaps') + '/', cMapPacked: true, standardFontDataUrl: join(root, 'standard_fonts') + '/',
    }).promise;
  } catch (error) {
    return finish({ ok: false, code: classify(error) });
  }
  // Число страниц — из документа, ДО извлечения текста (coding-style «Known Gotchas»).
  if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) return finish({ ok: false, code: 'pdf_invalid' });
  if (document.numPages > MAX_PAGES) return finish({ ok: false, code: 'pdf_too_many_pages', numPages: document.numPages });
  const pages = [];
  let total = 0;
  for (let n = 1; n <= document.numPages; n++) {
    let text;
    try {
      const page = await document.getPage(n);
      const content = await page.getTextContent({ includeMarkedContent: false });
      text = pageText(content.items);
      page.cleanup();
    } catch (error) {
      // Непрочитанная страница — отказ документа целиком («битый»), а не тихо проиндексированная часть.
      return finish({ ok: false, code: classify(error) });
    }
    total += text.length;
    if (total > MAX_TEXT_CHARS) return finish({ ok: false, code: 'pdf_text_too_large' });
    pages.push(text);
  }
  finish({ ok: true, numPages: pages.length, pages });
}

// Ошибка ВНЕ вызовов pdfjs — дефект этого файла, а не свойство документа: internal, а не «не PDF».
main().catch(() => finish({ ok: false, code: 'pdf_crashed' }));
