import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { VideoRetryService } from '../apps/web/src/server/video-retry';
import { quotaError } from '../apps/web/src/server/upload-contract';
import { ProgressPanel } from '../apps/web/src/app/videos/[videoId]/VideoDetail';
import { presentVideo, type VideoRow } from '../apps/web/src/server/screen';
const now = new Date('2026-09-23T20:59:59Z');
it.each(['user_llm', 'global_llm'])('retry refusal uses precise shared text and reset for %s', async scope => {
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.startsWith('SELECT v.')) return { rowCount: 1, rows: [{ status: 'failed', failure_reason: 'schema_violation', object_key: 'source', actual_bytes: '1' }] };
    if (sql.startsWith('SELECT id FROM transcript')) return { rowCount: 1, rows: [{ id: 'transcript' }] };
    if (sql.startsWith('UPDATE quota_counter')) return { rowCount: args?.[0] === scope ? 0 : 1, rows: [] };
    return { rowCount: 0, rows: [] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  const enqueue = vi.fn();
  await expect(new VideoRetryService(pool, loadLimits(environment()), enqueue, () => now).retry('account', 'video'))
    .rejects.toMatchObject({ message: quotaError(scope as 'user_llm' | 'global_llm', now).message,
      details: { scope, resets_at: '2026-09-23T21:00:00.000Z' } });
  expect(enqueue).not.toHaveBeenCalled(); expect(query.mock.calls.map(c => c[0])).toContain('COMMIT');
});
it('past reset is presented as already renewed without moving the persisted timestamp', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  try {
    const row: VideoRow = { id: 'v', status: 'failed', created_at: now, updated_at: now, finished_at: null,
      duration_seconds: '120', stage_progress: null, clips_done: 0, clips_total: 0, failure_reason: 'refused_user_minutes',
      object_key: 'source', actual_bytes: '1', plan: 'free', wait_reason: null };
    const html = renderToStaticMarkup(createElement(ProgressPanel, { video: presentVideo(row, new Date()) }));
    expect(html).toContain('Лимиты обновились'); expect(html).not.toContain('Лимиты обновятся');
    expect(html).not.toContain('завтра'); expect(html).not.toContain('disabled');
  } finally { vi.useRealTimers(); }
});
