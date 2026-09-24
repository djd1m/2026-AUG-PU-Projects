import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as probe from '../apps/worker/src/render/probe';
import * as exec from '../apps/worker/src/render/exec';
import * as framing from '../apps/worker/src/render/framing-plan';
import * as faces from '../apps/worker/src/render/faces';
import * as loudness from '../apps/worker/src/render/loudness';
import * as subtitles from '../apps/worker/src/render/subtitles';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { resetStingerCache } from '../apps/worker/src/render/packshot';
import { mapTime, planDuration, type Segment } from '../apps/worker/src/render/compaction';
const cutPlan: Segment[] = [[10, 20.08], [20.44, 30.08], [30.92, 42]];
const options = { inputPath: '/tmp/in.mp3', outputPath: '/tmp/out.mp4', startTime: 10, endTime: 42, format: 'portrait' as const,
  words: [{ word: 'before', start: 1, end: 2 }, { word: 'gone', start: 20.15, end: 20.3 }, { word: 'after', start: 34, end: 35 }],
  watermark: false, origin: 'https://clipmkr.ru', code: 'ABCDEF', cutPlan };
afterEach(() => { vi.restoreAllMocks(); resetStingerCache(); });
it.each([false, true])('mp3 compact one encode; planned D everywhere, music=%s', async music => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(30.27);
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValue(-20);
  vi.spyOn(loudness, 'measureFullLoudness').mockResolvedValue({ integrated: -20, peak: -3 });
  const subtitle = vi.spyOn(subtitles, 'generateSubtitleFile');
  let ass = '';
  const encode = vi.spyOn(exec, 'execFFmpeg').mockImplementation(async args => {
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    ass = await readFile(graph.match(/ass='([^']+)'/)![1]!, 'utf8');
  });
  const result = await renderClip({ ...options, music });
  const duration = planDuration(cutPlan);
  expect(result.duration_seconds).toBe(30.27);
  expect(encode).toHaveBeenCalledTimes(1);
  const args = encode.mock.calls[0]![0], graph = args[args.indexOf('-filter_complex') + 1]!;
  expect(args[args.lastIndexOf('-t') + 1]).toBe(String(duration));
  expect(args[args.indexOf('-t') + 1]).toBe('32');
  expect(graph).toContain(`:d=${duration},`); expect(graph).not.toContain('xfade=transition');
  expect(graph).toContain('acrossfade=d=0.08[ac]');
  expect(subtitle).toHaveBeenCalledWith([{ word: 'after', start: mapTime(cutPlan, 34), end: mapTime(cutPlan, 35) }], 0, duration, 'portrait');
  expect(ass).not.toContain('gone');
  if (music) {
    expect(loudness.measureLoudness).toHaveBeenCalledWith(options.inputPath, 10, 32, undefined);
    expect(loudness.measureFullLoudness).toHaveBeenCalledWith(options.inputPath, 10, 32, undefined);
    expect(graph).toContain('[ac]aformat='); expect(graph).toContain(`atrim=0:${duration}`);
    expect(graph).toContain(`afade=t=out:st=${duration - 1}`);
    expect(graph).toContain(`adelay=${Math.round((duration - .8) * 1000)}`);
    expect(loudness.measureLoudness).toHaveBeenCalledWith(expect.stringContaining('komiku'), 0, duration, undefined);
  } else expect(args).toContain('[ac]');
});
it('one-piece plan preserves every encoding argument except temporary directory', async () => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null); vi.spyOn(probe, 'probeDuration').mockResolvedValue(32);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  await renderClip({ ...options, words: [], cutPlan: undefined });
  await renderClip({ ...options, words: [], cutPlan: [[10, 42]] });
  expect(encode.mock.calls[0]![0]).toEqual(encode.mock.calls[1]![0]);
});
it('face samples are remapped before follow planning while detector sees source range', async () => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue({ index: 0, width: 1920, height: 1080 });
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(30.64);
  const report = { width: 1920, height: 1080, samples: [{ t: 34, faces: [] }] };
  const detect = vi.spyOn(faces, 'detectFaces').mockResolvedValue(report);
  const follow = vi.spyOn(framing, 'planFollow').mockReturnValue([]);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  await renderClip(options);
  expect(detect).toHaveBeenCalledWith(options.inputPath, 10, 42, undefined);
  expect(follow).toHaveBeenCalledWith({ ...report, samples: [{ t: mapTime(cutPlan, 34), faces: [] }] }, expect.anything(), expect.anything(), 0);
  expect(encode.mock.calls[0]![0].join(' ')).toContain('[vc]');
});

it('collapsed face samples produce a safe zero-length follow segment', async () => {
  const { getFollowFilter, singleWindow } = await import('../apps/worker/src/render/format');
  const source = { width: 1920, height: 1080 };
  const face = (cx: number) => ({ cx, cy: .4, w: .15, h: .2, score: 1 });
  const t = mapTime(cutPlan, 20.2);
  expect(mapTime(cutPlan, 20.3)).toBe(t);
  // Three blind samples reset to the median position at the same mapped instant.
  const samples = [{ t: 0, faces: [face(.2)] }, { t, faces: [face(.8)] },
    ...Array.from({ length: 3 }, () => ({ t, faces: [] }))];
  const follow = framing.planFollow({ ...source, samples }, source, singleWindow(source, .5), 0);
  expect(follow).toHaveLength(3);
  expect(follow[1]!.from).toBe(follow[2]!.from);
  const graph = getFollowFilter('portrait', source, follow);
  const boundary = `lt(t\\,${t.toFixed(2)})`;
  expect(graph.split(boundary)).toHaveLength(5); // two equal boundaries in x and y
  expect(graph).not.toMatch(/NaN|Infinity/);
  // Both equal-time branches use strict lt: at the join the final position wins.
  expect(graph).toContain(`\\,${singleWindow(source, follow[2]!.x, follow[2]!.y).x})`);
});
