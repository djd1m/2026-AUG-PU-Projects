import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { renderClip } from '../apps/worker/src/render/ffmpeg';
const db = vi.hoisted(() => ({ getRenderInput: vi.fn(), setRenderDeferred: vi.fn(), retryRender: vi.fn(), publishRenderResult: vi.fn() }));
vi.mock('@clipmaker/db', () => db);
import { handleRenderJob } from '../apps/worker/src/workers/render';
// Фича 27b clip-cta: воркер берёт вид призыва ИЗ БАЗЫ (getRenderInput), передаёт его рендеру, а контракт
// объекта связывает надпись; без призыва контракт побайтово равен эталону до фичи.
afterEach(() => { vi.restoreAllMocks(); });
it('вид из базы доходит до рендера; надпись входит в контракт; none — эталон', async () => {
  const seen: unknown[] = [], hashes: string[] = [];
  const directory = await mkdtemp('/tmp/cta-worker-');
  const input: Record<string, unknown> = { index: 1, object_key: 'source', actual_bytes: '10', plan: 'free', start_seconds: '0', end_seconds: '20',
    words: [], code: 'AB23456789', music: false, teaser: false, title: 'Клип', render_version: 1 };
  db.getRenderInput.mockImplementation(async () => ({ ...input })); db.setRenderDeferred.mockResolvedValue(true);
  db.publishRenderResult.mockImplementation(async (_p, _a, _r, publish) => { await publish(); return true; });
  const deps = { pool: {} as never, directory, origin: 'https://clipmaker.aicoding.space',
    download: async (_k: string, p: string) => { await writeFile(p, 'source'); },
    render: async (opts: Parameters<typeof renderClip>[0]) => {
      seen.push(opts.cta); await writeFile(opts.outputPath, 'video');
      return { duration_seconds: 20, music: null, packshot: null, teaser: null,
        cta: opts.cta === 'watch_full' ? { kind: 'watch_full', text: 'Полный выпуск — по ссылке', font_size: 72, start_seconds: 17.5 } : null };
    },
    thumbnail: async (_p: string, o: string) => { await writeFile(o, 'thumb'); },
    storage: { delete: vi.fn(async () => {}), put: async (_k: string, _p: string, _t: string, c: string) => { hashes.push(c); return 5; } },
    enqueue: async () => {}, available: async () => 30n };
  const attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render' as const, series_no: 1, attempt_no: 1, status: 'running' as const };
  try {
    const baseline = JSON.parse(await readFile('tests/fixtures/music-bed/baseline.json', 'utf8')).contract;
    input.cta_kind = 'none';
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    input.cta_kind = 'watch_full';
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(seen).toEqual(['none', 'watch_full']);
    expect(hashes[0]).toBe(baseline);
    expect(hashes[2]).not.toBe(baseline);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
