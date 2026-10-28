import { describe, it, expect, vi } from 'vitest';
import { createS3Client, signParts, generateDownloadUrl, calculatePartSize, completeMultipartUpload,
  getObjectBytes, headObject, abortMultipartUpload, UploadTooLarge } from '../packages/s3/src';
import { loadWebConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
function mockSend(ctx: ReturnType<typeof context>) {
  const send = vi.fn<(command: { input: unknown }) => Promise<unknown>>();
  ctx.client.send = send as unknown as typeof ctx.client.send; return send;
}
function context() { return { client: createS3Client(loadWebConfig(environment()).s3), bucket: 'n5-test' }; }
describe('адаптер январского клона', () => {
  it('Размер части меняется от размера файла', () => {
    expect(calculatePartSize(2_000_000_000)).toBeGreaterThan(calculatePartSize(20_000_000));
    expect(calculatePartSize(1)).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
  it('SigV4 ≤900с, одинаковая дата даёт одинаковые ссылки, никаких checksum/ContentLength', async () => {
    const ctx = context(), now = new Date('2026-09-22T00:00:00Z');
    const a = await signParts(ctx, 'videos/a/b/source.mp4', 'upload', 2, now);
    expect(await signParts(ctx, 'videos/a/b/source.mp4', 'upload', 2, now)).toEqual(a);
    for (const part of a) {
      const url = new URL(part.url);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
      expect(part.url).not.toContain('checksum');
      expect(part.expires_at).toBe('2026-09-22T00:15:00.000Z');
    }
    expect(new URL(await generateDownloadUrl(ctx, 'key')).searchParams.get('X-Amz-Expires')).toBe('900');
    ctx.client.destroy();
  });
  it('Сумма частей от S3, а не от тела; oversized не завершает объект', async () => {
    const ctx = context(); const send = mockSend(ctx).mockResolvedValue({ Parts: [
      { PartNumber: 1, ETag: 'a', Size: 1_000_000_001 }, { PartNumber: 2, ETag: 'b', Size: 1_000_000_000 }] });
    await expect(completeMultipartUpload(ctx, 'key', 'upload', [{ part_number: 1, etag: 'a' }, { part_number: 2, etag: 'b' }])).rejects.toBeInstanceOf(UploadTooLarge);
    expect(send).toHaveBeenCalledTimes(1); ctx.client.destroy();
  });
  it('Пагинация ListParts, сортировка и ETag до Complete', async () => {
    const ctx = context(); const send = mockSend(ctx)
      .mockResolvedValueOnce({ IsTruncated: true, NextPartNumberMarker: '1', Parts: [{ PartNumber: 1, ETag: 'a', Size: 12 }] })
      .mockResolvedValueOnce({ Parts: [{ PartNumber: 2, ETag: 'b', Size: 13 }] }).mockResolvedValueOnce({});
    await completeMultipartUpload(ctx, 'key', 'upload', [{ part_number: 2, etag: 'b' }, { part_number: 1, etag: 'a' }]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2]![0].input).toMatchObject({ MultipartUpload: { Parts: [{ PartNumber: 1, ETag: 'a' }, { PartNumber: 2, ETag: 'b' }] } });
    ctx.client.destroy();
  });
  it('Дубликаты, неполный список и неверный ETag не завершают загрузку', async () => {
    const ctx = context(); const send = mockSend(ctx).mockResolvedValue({ Parts: [{ PartNumber: 1, ETag: 'a', Size: 1 }] });
    await expect(completeMultipartUpload(ctx, 'key', 'u', [{ part_number: 1, etag: 'a' }, { part_number: 1, etag: 'a' }])).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await expect(completeMultipartUpload(ctx, 'key', 'u', [{ part_number: 1, etag: 'wrong' }])).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1); ctx.client.destroy();
  });
  it.each([
    ['"CaseSensitiveOpaque-1"', 'CaseSensitiveOpaque-1'],
    ['CaseSensitiveOpaque-1', '"CaseSensitiveOpaque-1"'],
    ['CaseSensitiveOpaque-1', 'CaseSensitiveOpaque-1'],
    ['"CaseSensitiveOpaque-1"', '"CaseSensitiveOpaque-1"'],
    ['""nested""', '""nested""'],
    ['" spaced "', ' spaced '],
  ])('ETag %s сверяется с %s, Complete получает исходный ListParts', async (clientTag, serverTag) => {
    const ctx = context(); const send = mockSend(ctx)
      .mockResolvedValueOnce({ IsTruncated: true, NextPartNumberMarker: '1', Parts: [{ PartNumber: 1, ETag: serverTag, Size: 12 }] })
      .mockResolvedValueOnce({ Parts: [{ PartNumber: 2, ETag: '"second-Opaque"', Size: 13 }] }).mockResolvedValueOnce({});
    await completeMultipartUpload(ctx, 'key', 'upload', [{ part_number: 2, etag: 'second-Opaque' }, { part_number: 1, etag: clientTag }]);
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'ListPartsCommand', 'ListPartsCommand', 'CompleteMultipartUploadCommand',
    ]);
    expect(send.mock.calls[2]![0].input).toMatchObject({ MultipartUpload: { Parts: [
      { PartNumber: 1, ETag: serverTag }, { PartNumber: 2, ETag: '"second-Opaque"' },
    ] } });
    ctx.client.destroy();
  });
  it.each([
    ['wrong', 'CaseSensitiveOpaque-1'],
    ['casesensitiveOpaque-1', 'CaseSensitiveOpaque-1'],
    [' CaseSensitiveOpaque-1', 'CaseSensitiveOpaque-1'],
    ['CaseSensitiveOpaque-1 ', 'CaseSensitiveOpaque-1'],
    ['"CaseSensitiveOpaque-1', 'CaseSensitiveOpaque-1'],
    ['CaseSensitiveOpaque-1"', 'CaseSensitiveOpaque-1'],
    ['""nested""', 'nested'],
    ['""nested""', '"nested"'],
    ['', ''], ['', '""'], ['""', ''], ['""', '""'],
  ])('Несовпадающий или пустой ETag %s / %s не вызывает Complete', async (clientTag, serverTag) => {
    const ctx = context(); const send = mockSend(ctx).mockResolvedValue({ Parts: [{ PartNumber: 1, ETag: serverTag, Size: 1 }] });
    await expect(completeMultipartUpload(ctx, 'key', 'u', [{ part_number: 1, etag: clientTag }])).rejects.toThrow();
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(clientTag ? ['ListPartsCommand'] : []);
    ctx.client.destroy();
  });
  it.each([
    [[1], [1, 2]], [[1, 2], [1]], [[1], [2]], [[1, 2], [1, 3]],
  ])('Несовпадающие номера клиента %j и S3 %j не вызывают Complete', async (clientNumbers, serverNumbers) => {
    const ctx = context(); const send = mockSend(ctx).mockResolvedValue({ Parts: serverNumbers.map((n) => ({ PartNumber: n, ETag: 'a', Size: 1 })) });
    await expect(completeMultipartUpload(ctx, 'key', 'u', clientNumbers.map((n) => ({ part_number: n, etag: 'a' })))).rejects.toThrow();
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['ListPartsCommand']);
    ctx.client.destroy();
  });
  it.each([[], [2], [1, 3], [0], [1, 1]])('Непригодная последовательность %j отклоняется до S3', async (...numbers) => {
    const ctx = context(); const send = mockSend(ctx);
    await expect(completeMultipartUpload(ctx, 'key', 'u', numbers.map((n) => ({ part_number: n, etag: 'a' })))).rejects.toThrow();
    expect(send).not.toHaveBeenCalled(); ctx.client.destroy();
  });
  it.each([undefined, '1'])('Непригодный следующий маркер %s не вызывает Complete', async (next) => {
    const ctx = context(); const send = mockSend(ctx)
      .mockResolvedValueOnce({ IsTruncated: true, NextPartNumberMarker: '1', Parts: [{ PartNumber: 1, ETag: 'a', Size: 1 }] })
      .mockResolvedValueOnce({ IsTruncated: true, NextPartNumberMarker: next, Parts: [] });
    await expect(completeMultipartUpload(ctx, 'key', 'u', [{ part_number: 1, etag: 'a' }])).rejects.toThrow();
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['ListPartsCommand', 'ListPartsCommand']);
    ctx.client.destroy();
  });
  it('HEAD без размера не становится нулём, GET ограничен Range, ошибки abort видны', async () => {
    const ctx = context(); const send = mockSend(ctx).mockResolvedValueOnce({});
    await expect(headObject(ctx, 'key')).rejects.toThrow();
    send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([1]) } });
    expect(await getObjectBytes(ctx, 'key')).toEqual(new Uint8Array([1]));
    expect(send.mock.calls[1]![0].input).toMatchObject({ Range: 'bytes=0-4095' });
    send.mockRejectedValueOnce(new Error('offline'));
    await expect(abortMultipartUpload(ctx, 'key', 'u')).rejects.toThrow('offline'); ctx.client.destroy();
  });
});
