import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import { pdfFixture } from '../fixtures/pdf';
import { createPdfExtractor, PDF_INVALID, PDF_NO_TEXT, PDF_TOO_MANY_PAGES } from '../../src/pdf/extract';
import { JobCeilingExceeded, JobLeaseLost, type JobContext } from '../../src/runner';
import { readPdfFile, savePdfDocument, savePdfPages } from '../../src/pdf/store';

vi.mock('../../src/pdf/store', () => ({ readPdfFile: vi.fn(), savePdfDocument: vi.fn(), savePdfPages: vi.fn() }));
const pool = {} as Pool;
const ctx = (): JobContext => ({ job: { id: 'job', accountId: 'acc', sourceId: 'src', kind: 'pdf', fileName: 'test.pdf',
  url: null, fence: 1, attempts: 1, progressDone: 0, progressTotal: null }, signal: new AbortController().signal,
  checkpoint: vi.fn(async () => {}), progress: vi.fn(async () => {}) });
const extractor = createPdfExtractor({ pool });
beforeEach(() => { vi.clearAllMocks(); });
const file = (bytes: Uint8Array) => vi.mocked(readPdfFile).mockResolvedValue({ id: 'f', bytes });
describe('real pdfjs local bytes', () => {
  it('two pages preserve text and 1-based page locators', async () => {
    file(pdfFixture(['First page', 'Second page'])); const context = ctx();
    expect(await extractor(context)).toBeNull();
    expect(savePdfPages).toHaveBeenCalledWith(pool, context, 'f', 2);
    expect(vi.mocked(savePdfDocument).mock.calls.map((c) => [c[2], c[3]])).toEqual([[1, 'First page'], [2, 'Second page']]);
    expect(context.progress).toHaveBeenLastCalledWith(2, 2);
  });
  it('301 pages fail before writes, 300 pages are allowed and empty pages skipped', async () => {
    file(pdfFixture(Array(301).fill('')));
    expect(await extractor(ctx())).toEqual({ state: 'failed', error: PDF_TOO_MANY_PAGES });
    expect(savePdfPages).not.toHaveBeenCalled(); expect(savePdfDocument).not.toHaveBeenCalled();
    file(pdfFixture(['Text', ...Array(299).fill('')]));
    expect(await extractor(ctx())).toBeNull(); expect(savePdfDocument).toHaveBeenCalledTimes(1);
  });
  it('scans and damaged PDFs return exact safe outcomes', async () => {
    file(pdfFixture(['', ''], true)); expect(await extractor(ctx())).toEqual({ state: 'failed', error: PDF_NO_TEXT });
    file(pdfFixture(['', ''])); expect(await extractor(ctx())).toEqual({ state: 'failed', error: PDF_NO_TEXT });
    file(new Uint8Array(Buffer.from('%PDF-private parser detail')));
    expect(await extractor(ctx())).toEqual({ state: 'failed', error: PDF_INVALID });
  });
  it.each([JobLeaseLost, JobCeilingExceeded])('%s propagates before parser/writes', async (ErrorType) => {
    file(pdfFixture(['Text'])); const context = ctx(); const error = new ErrorType();
    vi.mocked(context.checkpoint).mockRejectedValue(error);
    await expect(extractor(context)).rejects.toBe(error); expect(savePdfDocument).not.toHaveBeenCalled();
  });
  it('abort propagates and DB errors do not become parser failures', async () => {
    file(pdfFixture(['Text'])); const controller = new AbortController(); controller.abort(new JobLeaseLost());
    await expect(extractor({ ...ctx(), signal: controller.signal })).rejects.toBeInstanceOf(JobLeaseLost);
    const error = new Error('database failure'); vi.mocked(readPdfFile).mockRejectedValue(error);
    await expect(extractor(ctx())).rejects.toBe(error);
  });
});
