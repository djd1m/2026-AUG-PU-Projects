import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const deps = vi.hoisted(() => ({
  auth: { authenticate: vi.fn(async () => ({ account_id: 'session-account' })) },
  video: { create: vi.fn(async () => ({ video_id: 'id', upload_id: 'upload', part_size: 10, parts: [] })) },
  publicOrigin: 'https://test.invalid', trustedProxyHops: 2, allowMutation: vi.fn(async () => true),
}));
vi.mock('../apps/web/src/server/upload-runtime', () => ({ getUploadRuntime: () => deps }));
import { POST } from '../apps/web/src/app/api/trpc/[trpc]/route';
function request(body: unknown) {
  return new Request('https://test.invalid/api/trpc/video.create', { method: 'POST', headers: {
    'content-type': 'application/json', 'idempotency-key': randomUUID(),
    'x-forwarded-for': '192.0.2.1, 10.0.0.1, 10.0.0.2', cookie: '__Host-n5_session=' + 'x'.repeat(43),
  }, body: JSON.stringify(body) });
}
it('HTTP tRPC: invalid даёт 422 и понятный текст до service.create', async () => {
  deps.video.create.mockClear();
  const result = await POST(request({ declared_bytes: 0, filename: 'a.mp4', source: 'upload' }));
  expect(result.status).toBe(422);
  expect((await result.json()).error.data.upload).toMatchObject({ code: 'invalid', message: 'Проверьте имя, размер файла и источник загрузки' });
  expect(deps.video.create).not.toHaveBeenCalled();
});
it('HTTP tRPC: успех 202 содержит data/meta и ссылку загрузки', async () => {
  const result = await POST(request({ declared_bytes: 24, filename: 'a.mp4', source: 'upload' }));
  expect(result.status).toBe(202);
  expect((await result.json()).result.data).toMatchObject({ data: { video_id: 'id', upload_id: 'upload' }, meta: { request_id: expect.any(String) } });
});
it('HTTP tRPC: rate limit до чтения тела, batching не поддержан', async () => {
  deps.allowMutation.mockResolvedValueOnce(false);
  const req = request({}); const read = vi.spyOn(req.body!, 'getReader');
  expect((await POST(req)).status).toBe(429); expect(read).not.toHaveBeenCalled();
});
