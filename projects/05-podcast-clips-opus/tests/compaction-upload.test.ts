import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { VideoService } from '../apps/web/src/server/video';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
// Contract tests without PostgreSQL; SQL persistence/concurrency have a separate real-DB suite.
it('default false persists in SQL parameter, true passes; changed flag is 409 before S3', async () => {
  for (const compact of [undefined, false, true]) {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id FROM account')) return { rowCount: 1, rows: [{ id: 'account' }] };
      if (sql.includes('INSERT INTO video')) {
        expect(sql).toMatch(/music, teaser, compact, cta_kind, cta_url\)/); expect(sql).toContain('$8, $9, $10, $11, $12)');
        expect(params?.[9]).toBe(compact ?? false);
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM video')) return { rowCount: 1, rows: [{ id: 'video', declared_bytes: '24',
        status: 'uploading', failure_reason: null, music: false, teaser: false, compact: false, cta_kind: 'none', cta_url: null, upload_id: 'upload',
        object_key: 'source', upload_part_size: 24, upload_parts: [] }] };
      return { rowCount: 0, rows: [] };
    });
    const pool = { connect: async () => ({ query, release: () => {} }), query };
    const sign = vi.fn(async () => []);
    const storage = { initiate: vi.fn(), list: async () => [], sign, complete: vi.fn(), abort: vi.fn(),
      head: vi.fn(), bytes: vi.fn(), delete: vi.fn() };
    const service = new VideoService(pool as never, loadLimits(environment()), storage, async () => {});
    const call = service.create('account', randomUUID(), { filename: 'a.mp3', source: 'upload', declared_bytes: 24, compact });
    if (compact) { await expect(call).rejects.toMatchObject({ status: 409 }); expect(sign).not.toHaveBeenCalled(); }
    else { await expect(call).resolves.toMatchObject({ video_id: 'video' }); expect(sign).toHaveBeenCalled(); }
    await expect(service.create('account', randomUUID(), { filename: 'a.mp3', source: 'upload', declared_bytes: 24, extra: 1 }))
      .rejects.toMatchObject({ status: 422 });
  }
});
