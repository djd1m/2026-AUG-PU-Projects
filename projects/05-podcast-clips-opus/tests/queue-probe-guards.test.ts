import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('ADR-001 source guard: result UPDATE compares render_fence to own fence', () => {
  const source=readFileSync('packages/db/src/attempts.ts','utf8');
  const update=source.slice(source.indexOf('UPDATE clip SET status=\'done\''));
  expect(update).toMatch(/WHERE id=\$1 AND video_id=\$2 AND render_fence=\$3 AND status='rendering'/);
});
it('deferred source guard: video heartbeat updated under current fence', () => {
  const source=readFileSync('packages/db/src/probe.ts','utf8');
  const body=source.slice(source.indexOf('export async function deferProbe'),source.indexOf('export async function acceptProbe'));
  expect(body).toContain('UPDATE video SET updated_at=$3 WHERE id=$1 AND fence=$2');
});
it('ADR-006 source guard: render concurrency is literal one', () => {
  expect(readFileSync('apps/worker/src/workers/render.ts','utf8')).toMatch(/\{ connection, concurrency: 1, maxStalledCount: 1 \}/);
});
it('Redis colon ID compatibility is pinned by installed BullMQ check', () => {
  const source=readFileSync('node_modules/bullmq/dist/cjs/classes/job.js','utf8');
  expect(source).toContain(".split(':').length) !== 3");
});
