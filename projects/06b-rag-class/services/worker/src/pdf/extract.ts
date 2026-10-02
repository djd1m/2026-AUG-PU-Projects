import { type Pool } from '@n6b/db';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Extractor } from '../index-runner.js';
import type { JobContext } from '../runner.js';
import { readPdfFile, savePdfDocument, savePdfPages } from './store.js';

export const PDF_MAX_PAGES = 300;
export const PDF_NO_TEXT = 'в PDF нет текста (скан) — распознавание вне MVP';
export const PDF_TOO_MANY_PAGES = 'в PDF больше 300 страниц';
export const PDF_INVALID = 'Не удалось прочитать PDF: файл повреждён или защищён паролем';
class PdfFailure extends Error {}

// Only errors from the local parser become safe owner text. DB and lease errors propagate unchanged.
async function parse<T>(ctx: JobContext, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch { ctx.signal.throwIfAborted(); throw new PdfFailure(PDF_INVALID); }
}

export async function extractPdf(pool: Pool, ctx: JobContext): Promise<void> {
  const file = await readPdfFile(pool, ctx);
  await ctx.checkpoint();
  ctx.signal.throwIfAborted();
  const loading = await parse(ctx, async () => getDocument({ data: file.bytes, useWorkerFetch: false, stopAtErrors: true,
    disableFontFace: true, verbosity: 0 }));
  const abort = () => { void loading.destroy().catch(() => undefined); };
  ctx.signal.addEventListener('abort', abort, { once: true });
  try {
    ctx.signal.throwIfAborted();
    const pdf = await parse(ctx, () => loading.promise);
    await ctx.checkpoint();
    ctx.signal.throwIfAborted();
    if (pdf.numPages > PDF_MAX_PAGES) throw new PdfFailure(PDF_TOO_MANY_PAGES);
    await savePdfPages(pool, ctx, file.id, pdf.numPages);
    await ctx.progress(0, pdf.numPages);
    let nonempty = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      await ctx.checkpoint();
      ctx.signal.throwIfAborted();
      const page = await parse(ctx, () => pdf.getPage(p));
      try {
        const content = await parse(ctx, () => page.getTextContent());
        const text = content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        await ctx.checkpoint();
        ctx.signal.throwIfAborted();
        if (text) { await savePdfDocument(pool, ctx, p, text); nonempty++; }
        await ctx.progress(p, pdf.numPages);
      } finally { page.cleanup(); }
    }
    if (!nonempty) throw new PdfFailure(PDF_NO_TEXT);
  } finally {
    ctx.signal.removeEventListener('abort', abort);
    await loading.destroy().catch(() => undefined);
  }
}

export function createPdfExtractor({ pool }: { pool: Pool }): Extractor {
  return async (ctx) => {
    try { await extractPdf(pool, ctx); return null; }
    catch (error) {
      if (error instanceof PdfFailure) return { state: 'failed', error: error.message };
      throw error;
    }
  };
}
