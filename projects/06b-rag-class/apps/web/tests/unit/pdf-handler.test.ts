import { describe, expect, it } from 'vitest';
import { PDF_MAX_BYTES, PdfUploadError, type Pool, validatePdfBytes } from '@n6b/db';
import { PDF_BODY_MAX, readPdfUpload } from '@/server/pdf-handler';
import { createSourceHandler } from '@/server/jobs-handler';

function upload(bytes: Uint8Array, extra = false) {
  const form = new FormData(); form.append('file', new Blob([Buffer.from(bytes)]), 'test.pdf');
  if (extra) form.append('other', 'x');
  return new Request('https://cabinet.test/upload', { method: 'POST', body: form });
}
describe('PDF upload envelope and exact file boundaries', () => {
  it('accepts a multipart PDF and rejects extra fields/malformed multipart', async () => {
    const bytes = new Uint8Array(Buffer.from('%PDF-1.7\n'));
    expect((await readPdfUpload(upload(bytes))).bytes).toEqual(bytes);
    await expect(readPdfUpload(upload(bytes, true))).rejects.toMatchObject({ status: 422 });
    await expect(readPdfUpload(new Request('https://cabinet.test', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=abc' }, body: 'broken' }))).rejects.toMatchObject({ status: 422 });
  });
  it('size wins over signature; exact size allowed; high-bit imitation is not a signature', async () => {
    const bytes = Buffer.alloc(PDF_MAX_BYTES); bytes.write('%PDF-');
    expect(() => validatePdfBytes(bytes)).not.toThrow();
    await expect(readPdfUpload(upload(Buffer.alloc(PDF_MAX_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
    for (const bad of [Buffer.from('hello'), Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad])]) {
      expect(() => validatePdfBytes(bad)).toThrow(PdfUploadError);
      await expect(readPdfUpload(upload(bad))).rejects.toMatchObject({ status: 415 });
    }
  });
  it.each([null, '1'])('cancels streamed oversized body with Content-Length=%s before draining/buffering it', async (length) => {
    let reads = 0; let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const request = new Request('https://cabinet.test', { method: 'POST', body: stream,
      headers: { 'content-type': 'multipart/form-data; boundary=x', ...(length ? { 'content-length': length } : {}) },
      duplex: 'half' } as RequestInit);
    await expect(readPdfUpload(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    expect(reads).toBe(Math.floor(PDF_BODY_MAX / (1024 * 1024)) + 1);
  });
  it('cancels excessive declared size without reading', async () => {
    let reads = 0; let cancelled = false;
    const body = new ReadableStream({ pull() { reads++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    await expect(readPdfUpload(new Request('https://cabinet.test', { method: 'POST', body,
      headers: { 'content-length': String(PDF_BODY_MAX + 1) }, duplex: 'half' } as RequestInit))).rejects.toMatchObject({ status: 413 });
    expect(reads).toBe(0); expect(cancelled).toBe(true);
  });
  it('multipart dispatch applies Origin/session/id gates before accessing DB or body', async () => {
    const pool = new Proxy({}, { get() { throw new Error('DB reached'); } }) as Pool;
    const handler = createSourceHandler({ tenantPool: pool, authenticate: async () => 'account',
      publicBaseUrl: 'https://cabinet.test', log: () => {} });
    const request = (headers: Record<string, string>) => new Request('https://cabinet.test', { method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', ...headers }, body: 'bad' });
    expect((await handler(request({ origin: 'https://evil.test' }), 'id')).status).toBe(403);
    expect((await handler(request({ origin: 'https://cabinet.test' }), 'id')).status).toBe(401);
    expect((await handler(request({ origin: 'https://cabinet.test', cookie: `n6b_session=${'a'.repeat(43)}` }), 'id')).status).toBe(404);
  });
});
