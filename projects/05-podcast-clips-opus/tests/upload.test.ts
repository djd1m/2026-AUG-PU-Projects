import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { moscowDay, quotaResetAt } from '../packages/shared/src/upload';
import { loadS3Config } from '../packages/shared/src/config';
import { isAllowedMedia } from '../apps/web/src/server/media-type';
import { createVideoSchema, completeUploadSchema, quotaError } from '../apps/web/src/server/upload-contract';
import { createCompleteHandler } from '../apps/web/src/server/upload-handler';
import { AuthService, type AuthStore } from '../apps/web/src/server/auth';
import { appRouter } from '../apps/web/src/server/trpc';
import { quotaMessages } from '../apps/web/src/lib/limits-contract';
import { environment } from './fixtures/environment';

describe('upload: границы', () => {
  it('Московские сутки 23:59 → 00:01', () => {
    const before = new Date('2026-09-22T20:59:00Z'), after = new Date('2026-09-22T21:01:00Z');
    expect(moscowDay(before)).toBe('2026-09-22'); expect(moscowDay(after)).toBe('2026-09-23');
    expect(quotaResetAt(before)).toBe('2026-09-22T21:00:00.000Z');
    expect(quotaResetAt(after)).toBe('2026-09-23T21:00:00.000Z');
  });
  it('Размер и имя до заявки ключа, положительный целый размер ≤ 2 000 000 000', () => {
    for (const n of [0, -1, 1.2, 2_000_000_001, Infinity]) expect(createVideoSchema.safeParse({ declared_bytes: n, filename: 'a.mp4', source: 'upload' }).success).toBe(false);
    expect(createVideoSchema.safeParse({ declared_bytes: 2_000_000_000, filename: 'запись.mp4', source: 'upload' }).success).toBe(true);
    expect(createVideoSchema.safeParse({ declared_bytes: 1, filename: '../a.mp4', source: 'upload' }).success).toBe(false);
    expect(completeUploadSchema.safeParse({ video_id: randomUUID(), parts: [{ part_number: 1, etag: 'ok', size: 1 }] }).success).toBe(false);
  });
  it('Все параметры S3 обязательны, forcePathStyle не угадывается', () => {
    for (const name of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE']) {
      const env = environment(); delete env[name]; expect(() => loadS3Config(env)).toThrow(name);
    }
    expect(() => loadS3Config({ ...environment(), S3_FORCE_PATH_STYLE: 'yes' })).toThrow();
    expect(loadS3Config(environment()).forcePathStyle).toBe(true);
    expect(loadS3Config({ ...environment(), S3_FORCE_PATH_STYLE: 'false' }).forcePathStyle).toBe(false);
  });
  it('Пять пользовательских текстов; refunds скрыт за uploads', () => {
    expect(quotaError('user_upload_refunds', new Date()).message).toBe(quotaError('user_uploads', new Date()).message);
    expect(Object.keys(quotaMessages)).toHaveLength(6);
    expect(quotaError('global_minutes', new Date()).message).toBe(quotaError('global_llm', new Date()).message);
  });
  it('MP4, MOV, M4A, WebM, MP3 по байтам; мусор отвергнут', () => {
    for (const brand of ['isom', 'qt  ', 'M4A ']) {
      const b = Buffer.alloc(24); b.writeUInt32BE(24); b.write('ftyp', 4); b.write(brand, 8);
      expect(isAllowedMedia(b)).toBe(true);
    }
    expect(isAllowedMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))).toBe(true);
    expect(isAllowedMedia(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
    for (const bytes of [Buffer.from('<html>video.mp4</html>'), Buffer.alloc(0), Buffer.from([0xff, 0xff, 0xff, 0xff])]) expect(isAllowedMedia(bytes)).toBe(false);
  });
  it('tRPC video.create зарегистрирована и передаёт ключ и аккаунт из контекста', async () => {
    const data = { video_id: randomUUID(), upload_id: 'upload', part_size: 10, parts: [] };
    const create = vi.fn(async () => data), key = randomUUID();
    const caller = appRouter.createCaller({ account: 'session-account', idempotencyKey: key, requestId: 'req', video: { create } });
    const body = { declared_bytes: 20, filename: 'a.mp4', source: 'upload' as const };
    expect(await caller.video.create(body)).toEqual({ data, meta: { request_id: 'req' } });
    expect(create).toHaveBeenCalledWith('session-account', key, body);
  });
});
function handler(allowMutation = async () => true, session: { account_id: string } | null = { account_id: 'a' }) {
  const store: AuthStore = { findAccount: vi.fn(), register: vi.fn(), createSession: vi.fn(), revoke: vi.fn(), findSession: vi.fn(async () => session) };
  const complete = vi.fn(async () => ({ video_id: randomUUID(), status: 'queued' as const }));
  const run = createCompleteHandler({ auth: new AuthService(store, 'secret'), video: { complete }, publicOrigin: 'https://test.invalid', trustedProxyHops: 2, allowMutation });
  return { run, complete };
}
function request(body = '{}', extra: Record<string, string> = {}) {
  return new Request('https://test.invalid/api/upload/complete', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1, 10.0.0.1, 10.0.0.2',
    cookie: '__Host-n5_session=' + 'x'.repeat(43), ...extra }, body });
}
it('Лимитер до тела; Redis fail-closed; без сессии нет обработки', async () => {
  for (const allow of [async () => false, async () => { throw new Error('Redis offline'); }]) {
    const { run, complete } = handler(allow); const req = request(); const read = vi.spyOn(req.body!, 'getReader');
    expect([429, 503]).toContain((await run(req)).status); expect(read).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  }
  const { run, complete } = handler(undefined, null); expect((await run(request())).status).toBe(401); expect(complete).not.toHaveBeenCalled();
});
it('JSON лимит потока не обходит Content-Length; чужой Origin отклонён', async () => {
  const { run, complete } = handler();
  expect((await run(request('x'.repeat(65537), { 'content-length': '1' }))).status).toBe(413);
  expect((await run(request('{}', { origin: 'https://other.invalid' }))).status).toBe(403);
  expect(complete).not.toHaveBeenCalled();
});

