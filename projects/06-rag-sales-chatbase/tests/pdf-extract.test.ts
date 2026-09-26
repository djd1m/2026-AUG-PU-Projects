// ExtractPdf в дочернем процессе (FR-SOURCE-003, SC-US-004-1/2): настоящий pdfjs-dist на документах,
// собранных в тесте, и подменные дочерние процессы для таймаута, памяти и окружения. Главное свойство —
// враждебный документ завершается ОТКАЗОМ в пределах таймаута, а не зависает и не съедает машину.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { PDF_MAX_BYTES } from '../packages/rag/src/constants';
import { assertTextLayer, extractPdf, PdfFailure, runPdfChild, type ExtractOptions } from '../apps/worker/src/pdf/extract-pdf';
import { PDF_EXTRACT_TIMEOUT_MS } from '../apps/worker/src/pdf/limits';
import { brokenPdf, deepNestingPdf, encryptedPdf, fanOutFormsPdf, flateBombPdf, hugeTextPdf, manyObjectsPdf, multiPagePdf, nestedFormsPdf,
  normalPdf, pageTreeLoopPdf, scanPdf, truncatedPdf, buildPdf } from './fixtures/pdf-factory';

const FAKE = join(__dirname, 'fixtures', 'pdf-child-fakes.mjs');
async function failure(run: Promise<unknown>): Promise<PdfFailure> {
  const error = await run.then(() => null, (e: unknown) => e);
  if (!(error instanceof PdfFailure)) throw new Error(`ожидался отказ PdfFailure, получено: ${String(error)}`);
  return error;
}
async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await run();
  return { value, ms: performance.now() - start };
}

describe('ExtractPdf: обычные документы', () => {
  it('SC-US-004-1: текстовый PDF с кириллицей → текст страницы', async () => {
    const text = await extractPdf(normalPdf());
    expect(text.numPages).toBe(1);
    expect(text.pages[0]).toContain('Прайс-лист компании');
    expect(text.pages[0]).toContain('Доставка по России от 350 руб.');
  });
  it('многостраничный (12 страниц) → по тексту на страницу в порядке документа', async () => {
    const text = await extractPdf(multiPagePdf(12));
    expect(text.numPages).toBe(12);
    expect(text.pages).toHaveLength(12);
    expect(text.pages[2]).toContain('Страница 3');
    expect(text.pages[11]).toContain('Позиция 12 стоит 1200 руб.');
  });
  it('ровно 100 страниц — предел включительно', async () => {
    expect((await extractPdf(multiPagePdf(100))).numPages).toBe(100);
  }, 30_000);
});

describe('ExtractPdf: честные отказы', () => {
  it('SC-US-004-2: скан без текстового слоя → no_text_layer, а не пустой успех', async () => {
    const error = await failure(extractPdf(scanPdf(10, 0)));
    expect([error.code, error.reason]).toEqual(['pdf_no_text_layer', 'no_text_layer']);
  });
  it('граница 90 %: 9 из 10 страниц без текста — отказ; 8 из 10 — успех', async () => {
    expect((await failure(extractPdf(scanPdf(10, 1)))).reason).toBe('no_text_layer');
    const text = await extractPdf(scanPdf(10, 2));
    expect(text.pages.filter((p) => p.length >= 20)).toHaveLength(2);
  });
  it('правило текстового слоя: < 20 символов — «без текста», пустой документ — отказ', () => {
    expect(() => assertTextLayer([])).toThrow(PdfFailure);
    expect(() => assertTextLayer(['x'.repeat(19)])).toThrow(PdfFailure);
    expect(() => assertTextLayer(['x'.repeat(20)])).not.toThrow();
    expect(() => assertTextLayer([...Array<string>(9).fill(''), 'x'.repeat(20)])).toThrow(PdfFailure);
  });
  it('шифрованный PDF с паролем → pdf_encrypted (для пользователя no_text_layer: текст недоступен)', async () => {
    const error = await failure(extractPdf(encryptedPdf()));
    expect([error.code, error.reason]).toEqual(['pdf_encrypted', 'no_text_layer']);
  });
  it.each([['мусор после %PDF-', brokenPdf()], ['обрезанный файл', truncatedPdf()], ['цикл в дереве страниц', pageTreeLoopPdf()]])(
    'битый PDF (%s) → not_pdf', async (_title, pdf) => {
      const error = await failure(extractPdf(pdf));
      expect(error.reason).toBe('not_pdf');
    });
  it('101 страница → too_large, число страниц — до извлечения текста', async () => {
    const error = await failure(extractPdf(multiPagePdf(101)));
    expect([error.code, error.reason]).toEqual(['pdf_too_many_pages', 'too_large']);
  });
  it('больше 10 МБ → too_large без запуска разбора', async () => {
    const error = await failure(runPdfChild(Buffer.alloc(PDF_MAX_BYTES + 1, 0x20), { childScript: FAKE }));
    expect(error.code).toBe('pdf_too_many_bytes');
  });
  it('текст сверх потолка извлечения (≈ 8 млн символов) → too_large', async () => {
    const error = await failure(extractPdf(hugeTextPdf()));
    expect([error.code, error.reason]).toEqual(['pdf_text_too_large', 'too_large']);
  });
});

// «PDF-бомбы»: каждая обязана закончиться отказом за время ≤ таймаута + запас на запуск процесса.
describe('ExtractPdf: патологический вход укладывается в таймаут и завершается отказом', () => {
  const MARGIN_MS = 5000;
  it('бомба распаковки (400 КБ → 400 МБ) — убит по резидентной памяти при настоящих пределах', async () => {
    const pdf = await flateBombPdf(400);
    expect(pdf.length).toBeLessThan(1024 * 1024);
    const { value: error, ms } = await timed(() => failure(extractPdf(pdf)));
    expect([error.code, error.reason]).toEqual(['pdf_memory', 'too_large']);
    expect(ms).toBeLessThan(PDF_EXTRACT_TIMEOUT_MS + MARGIN_MS);
  }, 60_000);
  it('экспоненциальный разворот форм (2^40 вызовов, 7 КБ) — убит по таймауту', async () => {
    const options: ExtractOptions = { timeoutMs: 3000 };
    const { value: error, ms } = await timed(() => failure(extractPdf(fanOutFormsPdf(40), options)));
    expect([error.code, error.reason]).toEqual(['pdf_timeout', 'too_large']);
    expect(ms).toBeGreaterThanOrEqual(2900);
    expect(ms).toBeLessThan(3000 + MARGIN_MS);
  }, 30_000);
  it.each([
    ['глубокая вложенность массивов (500 000 уровней)', () => deepNestingPdf(500_000)],
    ['цепочка из 20 000 вложенных форм', () => nestedFormsPdf(20_000)],
    ['200 000 объектов при одной пустой странице', () => manyObjectsPdf(200_000)],
  ])('%s → отказ в пределах таймаута', async (_title, make) => {
    const pdf = make();
    expect(pdf.length).toBeLessThanOrEqual(PDF_MAX_BYTES);
    const { value: error, ms } = await timed(() => failure(extractPdf(pdf)));
    expect(['too_large', 'not_pdf', 'no_text_layer']).toContain(error.reason);
    expect(ms).toBeLessThan(PDF_EXTRACT_TIMEOUT_MS + MARGIN_MS);
  }, 60_000);
});

describe('Дочерний процесс: пределы исполняет родитель', () => {
  it('зависший разбор → SIGKILL по таймауту, отказ pdf_timeout, а не ожидание', async () => {
    const { value: error, ms } = await timed(() => failure(runPdfChild(Buffer.from('h'), { childScript: FAKE, timeoutMs: 1500 })));
    expect([error.code, error.reason]).toEqual(['pdf_timeout', 'too_large']);
    // Отказ приходит только по событию close — процесс к этому моменту завершён, а не брошен.
    expect(ms).toBeGreaterThanOrEqual(1400);
    expect(ms).toBeLessThan(1500 + 3000);
  }, 15_000);
  it('раздувание памяти вне кучи V8 → SIGKILL по резидентной памяти, pdf_memory', async () => {
    const error = await failure(runPdfChild(Buffer.from('m'), { childScript: FAKE, maxRssBytes: 200 * 1024 * 1024, timeoutMs: 10_000 }));
    expect([error.code, error.reason]).toEqual(['pdf_memory', 'too_large']);
  }, 15_000);
  it('окружение дочернего процесса пустое: ни ключа OpenRouter, ни адреса БД', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-test-must-not-leak';
    try {
      const text = await runPdfChild(Buffer.from('e'), { childScript: FAKE });
      expect(text.pages[0]).toMatch(/^env:/);
      expect(text.pages[0]).not.toMatch(/OPENROUTER|DATABASE_URL|REDIS_URL|SESSION_SECRET/);
    } finally {
      if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
    }
  });
  it('неизвестный код и мусор на выходе дочернего процесса — отказ internal, а не успех', async () => {
    const error = await failure(runPdfChild(Buffer.from('x'), { childScript: FAKE }));
    expect(error.reason).toBe('internal');
  });
  it('документ с пустыми страницами и одной текстовой — страницы без текста не выдуманы', async () => {
    const text = await runPdfChild(buildPdf([{ text: ['Единственная страница с текстом прайса'] }, { raw: 'q Q' }]));
    expect(text.pages).toEqual(['Единственная страница с текстом прайса', '']);
  });
});
