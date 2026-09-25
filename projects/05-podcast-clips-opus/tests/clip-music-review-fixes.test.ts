import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createS3Client, erasePrefix, eraseClipPrefix, type StorageContext } from '../packages/s3/src';
import { loadS3Config, loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { retentionTick } from '../apps/web/src/server/retention';
import { presentClip } from '../apps/web/src/server/screen';
import { ClipCard } from '../apps/web/src/app/clips/ClipCard';
import { ClipMusicService } from '../apps/web/src/server/clip-music';
import { publishRenderResult } from '../packages/db/src/render';
import type { Pool, Attempt } from '../packages/db/src';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());
const video = '11111111-1111-4111-8111-111111111111', clip = '22222222-2222-4222-8222-222222222222';
const track = 'holizna-bubbles';
function poolFor(query: ReturnType<typeof vi.fn>): Pool {
  return { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
}
it('retention uses real clip prefix validation and erases every version without touching sibling', async () => {
  const base = `clips/free/${video}/${clip}`, neighbour = base.slice(0, -1) + '3.mp4';
  const objects = new Set([base + '.mp4', base + '-v2.mp4', base + '-v30.mp4', neighbour]);
  const ctx: StorageContext = { client: createS3Client(loadS3Config(environment())), bucket: 'test' };
  ctx.client.send = vi.fn(async (command: { constructor: { name: string }; input: { Prefix?: string; Key?: string } }) => {
    switch (command.constructor.name) {
      case 'GetBucketVersioningCommand': case 'ListMultipartUploadsCommand': return {};
      case 'ListObjectsV2Command': return { Contents: [...objects].filter(k => k.startsWith(command.input.Prefix!)).slice(0, 1).map(Key => ({ Key })) };
      case 'DeleteObjectCommand': objects.delete(command.input.Key!); return {};
      default: throw new Error(command.constructor.name);
    }
  }) as unknown as typeof ctx.client.send;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.includes('SELECT count(*) FROM account')) return { rows: [{ count: '0' }] };
    if (sql.startsWith('SELECT c.id')) return { rows: [{ id: clip, video_id: video }], rowCount: 1 };
    if (sql.startsWith('UPDATE clip SET object_key=NULL')) expect([...objects]).toEqual([neighbour]);
    return { rows: [], rowCount: 0 };
  });
  try {
    await retentionTick(poolFor(query), { delete: async () => {}, erasePrefix: p => erasePrefix(ctx, p), eraseClipPrefix: p => eraseClipPrefix(ctx, p) });
    expect([...objects]).toEqual([neighbour]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE clip SET object_key=NULL'), expect.any(Array));
    for (const invalid of ['', `videos/${video}/${clip}`, base + '/', `clips/free/${video}/`, base.slice(0, -1), base + 'a']) {
      await expect(eraseClipPrefix(ctx, invalid)).rejects.toThrow('префикс');
    }
    await expect(erasePrefix(ctx, base)).rejects.toThrow('префикс');
  } finally { ctx.client.destroy(); }
});
it('known skipped choice rejects before quota, while screen shows rendered track and warning', async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT v.*')) return { rows: [{ id: video, status: 'done', music: true, plan: 'paid' }] };
    if (sql.startsWith('SELECT * FROM clip')) return { rows: [{ id: clip, index: 2, status: 'done', object_key: 'old', music_track_id: track,
      rendered_music_track_id: 'none', music_skip_reason: 'speech_too_quiet' }] };
    return { rows: [], rowCount: 0 };
  });
  const service = new ClipMusicService(poolFor(query), loadLimits(environment()), async () => {});
  for (const choice of [track, 'auto']) await expect(service.setMusic('owner', { clip_id: clip, track: choice })).rejects.toMatchObject({ status: 409 });
  expect(query.mock.calls.some(([sql]) => sql.includes('quota_counter'))).toBe(false);
  const row = { id: clip, index: 2, start_seconds: '0', end_seconds: '20', title: 'Клип', status: 'done' as const, watermarked: false,
    object_key: `clips/free/${video}/${clip}-v2.mp4`, expires_at: null, score: null, score_hook: null, score_completeness: null, score_length: null,
    explain_hook: null, explain_completeness: null, explain_length: null, music_track_id: track, rendered_music_track_id: 'none',
    music_skip_reason: 'speech_too_quiet', render_version: 3, rerender_failure: 'ffmpeg_timeout' };
  const screen = presentClip(row, { plan: 'paid', finished_at: null }, new Date());
  const card = renderToStaticMarkup(createElement(ClipCard, { clip: screen }));
  expect(card).toContain('value="none" selected=""'); expect(card).toContain('Музыка не подошла по громкости');
  expect(card).toContain('Не удалось пересобрать клип'); expect(card).toContain('/file?v=2');
  const pending = renderToStaticMarkup(createElement(ClipCard, { clip: { ...screen, rerendering: true } }));
  expect(pending).toContain('/file?v=2'); expect(pending).not.toContain('-pending');
});
it.each(['obsolete', 'adopted', 'retry', 'failed', 'v1'])('rejected publication cleanup protects adoption: %s', async state => {
  const key = `clips/free/${video}/${clip}${state === 'v1' ? '' : '-v2'}.mp4`, thumb = `thumbs/${video}/${clip}${state === 'v1' ? '' : '-v2'}.jpg`;
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT c.id FROM clip')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT c.object_key')) return { rows: [{ object_key: state === 'adopted' ? key : 'old', thumbnail_key: state === 'adopted' ? thumb : 'old-thumb',
      render_version: state === 'obsolete' ? 3 : 2, active: state === 'retry' || state === 'obsolete' }] };
    return { rows: [{ id: video }], rowCount: 1 };
  });
  const attempt: Attempt = { video_id: video, clip_id: clip, fence: 1, stage: 'render', series_no: 1, attempt_no: 1, status: 'running', rerender: true };
  const remove = vi.fn(async () => {});
  expect(await publishRenderResult(poolFor(query), attempt, { object_key: key, thumbnail_key: thumb, bytes: 5, watermarked: true, duration_seconds: 20 }, async () => 5, remove)).toBe(false);
  expect(remove.mock.calls).toEqual(['obsolete', 'failed'].includes(state) ? [[key], [thumb]] : []);
});
