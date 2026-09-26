// Обработчик источника «PDF» внутри задачи индексации (RunIndexJob п.2–5, ExtractPdf, ADR-009, ADR-018) —
// написано заново; форма — как у crawl/site-processor.ts: сброс счётчиков новой попытки под фенсом, затем
// каждая страница — одна транзакция «прогресс с фенсом (он же пульс) + строка page или пропуск».
// chunk-embed: страница с текстом → ChunkDocument → EmbedAndStore (векторы до транзакции) → writeIndexedPage —
// строка page и её фрагменты ОДНОЙ транзакцией с фенсом: текст страницы живёт только в памяти воркера, файл
// после задачи удаляется (ADR-018), и страница с хэшем без фрагментов была бы потеряна навсегда.
// Файл из тома удаляет RunIndexJob (onSettled) после done И failed.
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { recordProgressTx, resetAttemptCountersTx, transaction, writeIndexedPage, type Lease, type Pool } from '@n6/db';
import { chunkDocument, isPdfMagic, PDF_MAX_BYTES, plainTextBlocks } from '@n6/rag';
import type { Embedder } from '../embed/embed-and-store';
import { StepFailure, type SourceProcessor } from '../run-index-job';
import { extractPdf, isPageWithoutText, PdfFailure, type ExtractOptions, type PdfText } from './extract-pdf';
import { uploadPath } from './uploads';

export interface PdfProcessorOptions {
  pool: Pool; uploadDir: string; embedder: Embedder;
  extract?: (bytes: Buffer, options?: ExtractOptions) => Promise<PdfText>;
  extractOptions?: ExtractOptions;
  log?: (line: string) => void;
}
// Подпись страницы — источник ответа «прайс.pdf, с. 3» (FR-INDEX-001, Pseudocode page.url_or_page).
export const pageLabel = (fileName: string, page: number) => `${fileName}#с. ${page}`;
export const pdfPageHash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function createPdfProcessor(options: PdfProcessorOptions): SourceProcessor {
  const { pool } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const extract = options.extract ?? extractPdf;
  const fail = (lease: Lease, code: string, reason: ConstructorParameters<typeof StepFailure>[0]): never => {
    log(`worker-index: PDF задачи ${lease.indexJobId} отказал: ${code} → ${reason}`);
    throw new StepFailure(reason);
  };
  return async (lease: Lease) => {
    const source = await pool.query<{ kind: string; file_name: string | null }>('SELECT kind, file_name FROM source WHERE id = $1 AND bot_id = $2',
      [lease.sourceId, lease.botId]);
    const row = source.rows[0];
    if (!row || row.kind !== 'pdf' || !row.file_name) return fail(lease, 'pdf_source_mismatch', 'internal');
    const fileName = row.file_name;
    const path = uploadPath(options.uploadDir, lease.indexJobId);
    // Граница файла ещё раз — на стороне разбора: том общий, и воркер не доверяет тому, что туда легло.
    const info = await lstat(path).catch(() => null);
    // Файла нет: удалён после прошлого завершения («Повторить» PDF требует загрузить файл заново) или не записан.
    if (!info) return fail(lease, 'pdf_missing_file', 'internal');
    if (!info.isFile()) return fail(lease, 'pdf_not_regular_file', 'internal');
    if (info.size > PDF_MAX_BYTES) return fail(lease, 'pdf_too_many_bytes', 'too_large');
    const bytes = await readFile(path);
    if (bytes.length > PDF_MAX_BYTES) return fail(lease, 'pdf_too_many_bytes', 'too_large');
    if (!isPdfMagic(bytes)) return fail(lease, 'pdf_bad_magic', 'not_pdf');
    const startedAt = Date.now();
    let text: PdfText;
    try {
      text = await extract(bytes, options.extractOptions);
    } catch (error) {
      if (error instanceof PdfFailure) return fail(lease, error.code, error.reason);
      throw error;
    }
    const known = new Set((await pool.query<{ url_or_page: string; content_hash: string }>(
      'SELECT url_or_page, content_hash FROM page WHERE source_id = $1', [lease.sourceId])).rows.map((r) => `${r.url_or_page}\u0000${r.content_hash}`));
    // Новая попытка пересчитывает страницы заново: счётчики — с нуля, всего — число страниц документа,
    // фрагменты — от числа уже записанных у источника.
    await transaction(pool, (tx) => resetAttemptCountersTx(tx, lease, text.numPages));
    const seen = new Set<string>();
    let read = 0, unchanged = 0, empty = 0, duplicate = 0, chunksWritten = 0;
    for (let index = 0; index < text.pages.length; index++) {
      const pageText = text.pages[index]!;
      const label = pageLabel(fileName, index + 1);
      const hash = pdfPageHash(pageText);
      const kind = isPageWithoutText(pageText) ? 'empty' : seen.has(hash) ? 'duplicate' : known.has(`${label}\u0000${hash}`) ? 'unchanged' : 'page';
      seen.add(hash);
      if (kind === 'page') {
        const title = `${fileName}, с. ${index + 1}`;
        const chunks = chunkDocument({ title, blocks: plainTextBlocks(pageText) });
        const vectors = await options.embedder.embed(lease, chunks);
        chunksWritten += (await writeIndexedPage(pool, lease, { urlOrPage: label, title, contentHash: hash },
          chunks.map((c, i) => ({ ...c, embedding: vectors[i]! })))).inserted;
      } else {
        await transaction(pool, async (tx) => {
          await recordProgressTx(tx, lease, { pagesDone: kind === 'unchanged' ? 1 : 0 });
          if (kind === 'empty' || kind === 'duplicate') await tx.query('UPDATE source SET pages_skipped = pages_skipped + 1 WHERE id = $1', [lease.sourceId]);
        });
      }
      if (kind === 'page') read++; else if (kind === 'unchanged') unchanged++; else if (kind === 'empty') empty++; else duplicate++;
    }
    // В журнал — только счётчики: ни текста, ни имени файла.
    log(`worker-index: PDF задачи ${lease.indexJobId}: страниц ${text.numPages}, прочитано ${read}, без изменений ${unchanged}, `
      + `без текста ${empty}, дублей ${duplicate}, фрагментов ${chunksWritten}; разбор ${Date.now() - startedAt} мс`);
  };
}
