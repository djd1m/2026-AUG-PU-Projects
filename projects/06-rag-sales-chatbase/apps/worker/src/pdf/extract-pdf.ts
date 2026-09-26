// ExtractPdf (Pseudocode, FR-SOURCE-003, SC-US-004-1/2) — написано заново (нет в донорах, ADR-016); форма
// «внешний разборщик — отдельный процесс с таймаутом» — как ffprobe у N5 (apps/worker/src/media/*).
// PDF — внешний враждебный ввод. Разбор идёт в ДОЧЕРНЕМ процессе (extract-child.mjs), и все пределы
// исполняются СНАРУЖИ, где разбираемый документ их не может отменить:
//  • таймаут на разбор целиком → SIGKILL → отказ pdf_timeout (зависший разбор — отказ, не ожидание);
//  • замер резидентной памяти (/proc/<pid>/status) → SIGKILL → pdf_memory: буферы распаковки потоков
//    живут ВНЕ кучи V8, и --max-old-space-size их не видит (замер: flate-бомба 400 КБ → 915 МБ RSS);
//  • потолок stdout; пустое окружение (ни ключа OpenRouter, ни адреса БД в дочернем процессе).
// Правило «≥ 90 % страниц без текста → no_text_layer» — здесь, в родителе, по возвращённому тексту.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDF_MAX_BYTES, PDF_MAX_PAGES, PDF_MIN_PAGE_TEXT_CHARS, PDF_NO_TEXT_SHARE, type IndexJobFailureReason } from '@n6/rag';
import { PDF_CHILD_HEAP_MB, PDF_CHILD_MAX_RSS_BYTES, PDF_EXTRACT_TIMEOUT_MS, PDF_MAX_OUTPUT_BYTES, PDF_MAX_STDERR_BYTES,
  PDF_MAX_TEXT_CHARS, PDF_RSS_POLL_MS } from './limits';

// Подробный код отказа — для журнала воркера; пользователю — причина из закрытого списка канона §4.
export const PDF_FAILURE_REASON = {
  pdf_timeout: 'too_large', pdf_memory: 'too_large', pdf_output_too_large: 'too_large', pdf_text_too_large: 'too_large',
  pdf_too_many_pages: 'too_large', pdf_too_many_bytes: 'too_large', pdf_too_complex: 'too_large',
  pdf_encrypted: 'no_text_layer', pdf_no_text_layer: 'no_text_layer', pdf_invalid: 'not_pdf',
  pdf_crashed: 'internal', pdf_bad_arguments: 'internal', pdf_bad_output: 'internal', pdf_unsupported_platform: 'internal',
} as const satisfies Record<string, IndexJobFailureReason>;
export type PdfFailureCode = keyof typeof PDF_FAILURE_REASON;

export class PdfFailure extends Error {
  readonly reason: IndexJobFailureReason;
  constructor(readonly code: PdfFailureCode) {
    super(`Разбор PDF отказал: ${code}`);
    this.name = 'PdfFailure';
    this.reason = PDF_FAILURE_REASON[code];
  }
}

export interface PdfText { numPages: number; pages: string[] }
export interface ExtractOptions {
  timeoutMs?: number; maxRssBytes?: number; heapMb?: number; maxTextChars?: number; maxPages?: number;
  childScript?: string; // только для тестов: подменный дочерний процесс (зависающий, раздувающий память)
}

export const CHILD_SCRIPT = join(__dirname, 'extract-child.mjs');

function residentBytes(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'latin1');
    const at = status.indexOf('VmRSS:');
    if (at < 0) return null;
    const end = status.indexOf('\n', at);
    const kb = Number.parseInt(status.slice(at + 6, end < 0 ? undefined : end).trim(), 10);
    return Number.isSafeInteger(kb) ? kb * 1024 : null;
  } catch { return null; } // процесс уже завершился
}

const isPageTexts = (value: unknown, numPages: number, maxChars: number): value is string[] => {
  if (!Array.isArray(value) || value.length !== numPages) return false;
  let total = 0;
  for (const page of value) {
    if (typeof page !== 'string') return false;
    total += page.length;
  }
  return total <= maxChars;
};

// Разбор байтов документа. Бросает PdfFailure; при успехе — текст каждой страницы (по порядку).
export function runPdfChild(bytes: Buffer, options: ExtractOptions = {}): Promise<PdfText> {
  const timeoutMs = options.timeoutMs ?? PDF_EXTRACT_TIMEOUT_MS;
  const maxRss = options.maxRssBytes ?? PDF_CHILD_MAX_RSS_BYTES;
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  const maxTextChars = options.maxTextChars ?? PDF_MAX_TEXT_CHARS;
  // Предел памяти исполним только там, где её можно измерить; иначе — отказ, а не разбор без предела.
  if (process.platform !== 'linux') return Promise.reject(new PdfFailure('pdf_unsupported_platform'));
  if (bytes.length > PDF_MAX_BYTES) return Promise.reject(new PdfFailure('pdf_too_many_bytes'));
  return new Promise<PdfText>((resolve, reject) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${options.heapMb ?? PDF_CHILD_HEAP_MB}`, options.childScript ?? CHILD_SCRIPT,
      String(maxPages), String(maxTextChars), String(PDF_MAX_BYTES)], { stdio: ['pipe', 'pipe', 'pipe'], env: {}, windowsHide: true });
    let killedFor: PdfFailureCode | null = null;
    const stop = (code: PdfFailureCode) => { if (!killedFor) { killedFor = code; child.kill('SIGKILL'); } };
    const out: Buffer[] = [];
    let outBytes = 0, errText = '';
    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > PDF_MAX_OUTPUT_BYTES) { stop('pdf_output_too_large'); return; }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (errText.length < PDF_MAX_STDERR_BYTES) errText += chunk.toString('latin1', 0, PDF_MAX_STDERR_BYTES); });
    child.stdin.on('error', () => {}); // процесс умер раньше, чем дочитал: итог решает событие close
    const timer = setTimeout(() => stop('pdf_timeout'), timeoutMs);
    const poll = setInterval(() => {
      const rss = child.pid ? residentBytes(child.pid) : null;
      if (rss !== null && rss > maxRss) stop('pdf_memory');
    }, PDF_RSS_POLL_MS);
    child.on('error', () => { clearTimeout(timer); clearInterval(poll); reject(new PdfFailure('pdf_crashed')); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      clearInterval(poll);
      if (killedFor) { reject(new PdfFailure(killedFor)); return; }
      // Нехватка кучи V8 — аварийное завершение (SIGABRT / код 134) с характерной строкой в stderr.
      if (signal === 'SIGABRT' || exitCode === 134 || errText.includes('heap out of memory')) { reject(new PdfFailure('pdf_memory')); return; }
      let result: unknown;
      try { result = JSON.parse(Buffer.concat(out, outBytes).toString('utf8')); } catch { reject(new PdfFailure(exitCode === 0 ? 'pdf_bad_output' : 'pdf_crashed')); return; }
      if (!result || typeof result !== 'object') { reject(new PdfFailure('pdf_bad_output')); return; }
      const r = result as { ok?: unknown; code?: unknown; numPages?: unknown; pages?: unknown };
      if (r.ok === false) {
        reject(new PdfFailure(typeof r.code === 'string' && r.code in PDF_FAILURE_REASON ? r.code as PdfFailureCode : 'pdf_bad_output'));
        return;
      }
      const numPages = r.numPages;
      if (r.ok !== true || typeof numPages !== 'number' || !Number.isSafeInteger(numPages) || numPages < 1 || numPages > maxPages
        || !isPageTexts(r.pages, numPages, maxTextChars)) { reject(new PdfFailure('pdf_bad_output')); return; }
      resolve({ numPages, pages: r.pages });
    });
    child.stdin.end(bytes);
  });
}

// ExtractPdf п.2: страница «без текста» — меньше 20 символов; ≥ 90 % таких страниц — скан без текстового
// слоя (no_text_layer), а не пустой успех. Целочисленно: empty × 10 ≥ total × 9 (без плавающей запятой).
export function isPageWithoutText(text: string): boolean {
  return text.trim().length < PDF_MIN_PAGE_TEXT_CHARS;
}
export function assertTextLayer(pages: readonly string[]): void {
  const empty = pages.filter(isPageWithoutText).length;
  if (pages.length === 0 || empty * 10 >= pages.length * Math.round(PDF_NO_TEXT_SHARE * 10)) throw new PdfFailure('pdf_no_text_layer');
}

export async function extractPdf(bytes: Buffer, options: ExtractOptions = {}): Promise<PdfText> {
  const text = await runPdfChild(bytes, options);
  assertTextLayer(text.pages);
  return text;
}
