import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MUSIC_CATALOG, effectiveMusic } from '../packages/shared/src/music-catalog';
import { MUSIC_TRACKS, resolveMusicTrack } from '../apps/worker/src/render/music';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import * as loudness from '../apps/worker/src/render/loudness';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import * as packshot from '../apps/worker/src/render/packshot';
import { ClipMusicChoice } from '../apps/web/src/app/clips/ClipMusicChoice';
import { ClipCard } from '../apps/web/src/app/clips/ClipCard';
import { loadLimits, loadWorkerConfig, loadWebConfig } from '../packages/shared/src/config';
import { QUOTA_SCOPE } from '../packages/shared/src/enums';
import { environment } from './fixtures/environment';
import { checkWiring } from '../scripts/check-env-wiring.mjs';
import { setMusicSchema, ClipMusicService } from '../apps/web/src/server/clip-music';
import { appRouter } from '../apps/web/src/server/trpc';
import type { Pool } from '../packages/db/src';
import type { ClipScreen } from '../apps/web/src/lib/screen-contract';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());
const clip: ClipScreen = { clip_id: '11111111-1111-4111-8111-111111111111', index: 1, start: 0, end: 20,
  title: 'Клип', status: 'done', watermarked: false, available: true, expires_at: null };
it('catalogue has nine tracks in exact worker order and each preview exists', () => {
  expect(MUSIC_CATALOG).toHaveLength(9);
  expect(MUSIC_CATALOG.map(t => t.id)).toEqual(MUSIC_TRACKS.map(t => t.id));
  for (const track of MUSIC_CATALOG) expect(existsSync(`apps/web/public/music-previews/${track.id}.mp3`), track.id).toBe(true);
  expect(QUOTA_SCOPE).toHaveLength(7);
});
it('result equivalence: auto without music = none; auto with music resolves by index', () => {
  expect(effectiveMusic('auto', false, 2)).toBe(effectiveMusic('none', true, 2));
  expect(effectiveMusic(null, true, 2)).toBe(MUSIC_CATALOG[1].id);
  expect(effectiveMusic(MUSIC_CATALOG[2].id, false, 1)).toBe(MUSIC_CATALOG[2].id);
});
it.each(['web', 'worker-stt', 'worker-llm'] as const)('%s requires rerender limit with its consequence and explicit wiring', role => {
  const env = environment(); delete env.N5_LIMIT_USER_RERENDERS;
  expect(() => role === 'web' ? loadWebConfig(env) : loadWorkerConfig(role, env)).toThrow('N5_LIMIT_USER_RERENDERS');
  expect(() => loadLimits(env)).toThrow('смена музыки останется без потолка перерендеров');
  const config = { services: Object.fromEntries(['web', 'worker-stt', 'worker-llm', 'worker-video'].map(name => [name, { environment: environment() }])) };
  delete config.services[role]!.environment.N5_LIMIT_USER_RERENDERS;
  expect(checkWiring(config)).toEqual([`${role}: N5_LIMIT_USER_RERENDERS`]);
});
it('strict input rejects unknown track and extra field before querying DB; tRPC returns 422', async () => {
  const query = vi.fn(), service = new ClipMusicService({ query } as unknown as Pool, loadLimits(environment()), async () => {});
  const caller = appRouter.createCaller({ account: 'owner', requestId: 'r', idempotencyKey: null,
    video: { create: vi.fn() }, music: service });
  for (const input of [{ clip_id: clip.clip_id, track: 'bogus' }, { clip_id: clip.clip_id, track: 'none', extra: 1 }]) {
    expect(setMusicSchema.safeParse(input).success).toBe(false);
    await expect(caller.clip.setMusic(input)).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT' });
  }
  expect(query).not.toHaveBeenCalled();
});
it('card exposes current choice, preview buttons, busy state and versioned file URL', () => {
  const html = renderToStaticMarkup(createElement(ClipMusicChoice, { clip: { ...clip, music_track_id: MUSIC_CATALOG[1].id, rerendering: true } }));
  expect(html).toContain('Пересобираем…'); expect(html).toMatch(/<select[^>]*disabled/);
  expect(html).toContain('value="holizna-bubbles" selected=""');
  expect(html.match(/aria-label="Послушать /g)).toHaveLength(9); expect(html).toContain('<audio');
  const card = renderToStaticMarkup(createElement(ClipCard, { clip: { ...clip, render_version: 2 } }));
  expect(card).toContain(`/file?v=2`);
  const pending = renderToStaticMarkup(createElement(ClipCard, { clip: { ...clip, render_version: 2, rerendering: true } }));
  expect(pending).toContain('/file?v=2"'); expect(pending).not.toContain('-pending');
  // VideoDetail already polls all states (including done with an active rerender).
  expect(readFileSync('apps/web/src/app/videos/[videoId]/VideoDetail.tsx', 'utf8')).toContain("rpc<{ clips: ClipScreen[] }>('clip.list'");
});
const options = { inputPath: '/tmp/input.wav', outputPath: '/tmp/output.mp4', startTime: 0, endTime: 20,
  format: 'portrait' as const, words: [], watermark: false, origin: 'https://clipmkr.ru', code: 'ABC234', clipIndex: 1 };
it.each(['none', 'unknown'])('%s disables both music and packshot despite video music', async choice => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null); vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  const mix = vi.spyOn(loudness, 'measureLoudness'), shot = vi.spyOn(packshot, 'preparePackshot');
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(await renderClip({ ...options, music: true, musicTrackId: choice })).toMatchObject({ music: null, packshot: null });
  expect(encode.mock.calls[0]![0].filter(a => a === '-i')).toHaveLength(1);
  expect(mix).not.toHaveBeenCalled(); expect(shot).not.toHaveBeenCalled();
  if (choice === 'unknown') expect(log).toHaveBeenCalledWith(expect.stringContaining('music_track_unknown'));
});
it('explicit id enables chosen track and packshot when video music=false', async () => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null); vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  const measure = vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-20).mockResolvedValueOnce(-15);
  const shot = vi.spyOn(packshot, 'preparePackshot').mockResolvedValue(null);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const selected = MUSIC_TRACKS[2]!;
  expect((await renderClip({ ...options, music: false, musicTrackId: selected.id })).music?.track).toBe(`${selected.id}:${selected.sha256}`);
  expect(measure).toHaveBeenNthCalledWith(2, selected.path, 0, 20, undefined);
  expect(encode.mock.calls[0]![0]).toContain(selected.path); expect(shot).toHaveBeenCalledOnce();
});
it('NULL preserves automatic worker selection', () => {
  expect(resolveMusicTrack(null, true, 2)).toBe(MUSIC_TRACKS[2]);
  expect(resolveMusicTrack(null, false, 2)).toBeNull();
});
it('compose shares rerender quota with every limit reader; env checker names missing variable', async () => {
  const { mkdtempSync, writeFileSync, rmSync, openSync, closeSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const compose = readFileSync('docker-compose.yml', 'utf8');
  expect(compose.split('x-quota-env: &quota-env')[1]!.split('x-s3-env')[0]).toContain('N5_LIMIT_USER_RERENDERS: ${N5_LIMIT_USER_RERENDERS:?');
  const dir = mkdtempSync(join(tmpdir(), 'clip-music-env-')), file = join(dir, 'env');
  const run = () => {
    const output = join(dir, 'log'), fd = openSync(output, 'w');
    try {
      const result = spawnSync('sh', ['scripts/check-env-complete.sh', file], { stdio: ['ignore', fd, fd] });
      return { status: result.status, output: readFileSync(output, 'utf8') };
    } finally { closeSync(fd); }
  };
  try {
    const names = [...new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map(match => match[1]!))];
    writeFileSync(file, names.map(name => `${name}=test`).join('\n') + '\n');
    expect(run().status).toBe(0);
    writeFileSync(file, names.filter(name => name !== 'N5_LIMIT_USER_RERENDERS').map(name => `${name}=test`).join('\n') + '\n');
    const missing = run();
    expect(missing.status).toBe(1); expect(missing.output).toContain('N5_LIMIT_USER_RERENDERS');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it.each([[-65, -20, 'speech_too_quiet'], [-10, -50, 'gain_out_of_range']] as const)('loudness skip %s/%s reaches render outcome', async (speech, bed, reason) => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null); vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(speech).mockResolvedValueOnce(bed);
  vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  expect(await renderClip({ ...options, musicTrackId: MUSIC_CATALOG[1].id })).toMatchObject({ music: null, music_skip_reason: reason });
});
