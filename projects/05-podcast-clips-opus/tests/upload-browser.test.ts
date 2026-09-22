import { afterEach, expect, it, vi } from 'vitest';
import { uploadParts } from '../apps/web/src/lib/upload-parts';
afterEach(() => vi.unstubAllGlobals());
const parts = [1, 2].map((n) => ({ part_number: n, url: `https://storage.invalid/part-${n}?signature=original`, expires_at: '2099-01-01T00:00:00Z' }));
it('Прямой PUT в S3: размер частей от сервера, URL и заголовки не дополняются', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 200, headers: { ETag: 'etag' } })); vi.stubGlobal('fetch', fetcher);
  expect(await uploadParts(new Blob(['1234567']), { part_size: 5, parts })).toHaveLength(2);
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
  expect(calls.map(([url]) => url)).toEqual(parts.map((p) => p.url));
  expect(await (calls[0]![1].body as Blob).text()).toBe('12345');
  expect(await (calls[1]![1].body as Blob).text()).toBe('67');
  for (const [, options] of calls) { expect(options.method).toBe('PUT'); expect(options.headers).toBeUndefined(); }
});
it('CORS/network отказ превращается в понятную ошибку, а не зависание', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  await expect(uploadParts(new Blob(['file']), { part_size: 5, parts })).rejects.toThrow('Не удалось связаться с хранилищем');
});
it('Невидимый из-за CORS ETag — явная ошибка; истёкшая ссылка не отправляется', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 200 })); vi.stubGlobal('fetch', fetcher);
  await expect(uploadParts(new Blob(['file']), { part_size: 5, parts })).rejects.toThrow('не подтвердило');
  fetcher.mockClear();
  await expect(uploadParts(new Blob(['file']), { part_size: 5, parts: [{ ...parts[0]!, expires_at: '2020-01-01T00:00:00Z' }] })).rejects.toThrow('Срок ссылки истёк');
  expect(fetcher).not.toHaveBeenCalled();
});
