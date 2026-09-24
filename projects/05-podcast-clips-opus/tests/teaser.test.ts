import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { layoutTeaser, buildTeaserFilter, prepareTeaser, TEASER_Y, TEASER_SECONDS, TEASER_FADE_SECONDS,
  TEASER_MAX_LINES, TEASER_FONT_SIZE, TEASER_BOX_BORDER_WIDTH } from '../apps/worker/src/render/teaser';
import { measureText, watermarkGeometry } from '../packages/shared/src/watermark';
import { buildFilterChain, renderClip } from '../apps/worker/src/render/ffmpeg';
import * as exec from '../apps/worker/src/render/exec';
import * as music from '../apps/worker/src/render/music';
import * as probe from '../apps/worker/src/render/probe';
import { createVideoSchema } from '../apps/web/src/server/upload-contract';
import { SUBTITLE_FONT_SIZE } from '../apps/worker/src/render/subtitles';
const options = { inputPath: '/tmp/input.wav', outputPath: '/tmp/output.mp4', startTime: 2, endTime: 22,
  format: 'portrait' as const, words: [{ word: 'Привет', start: 3, end: 4 }], watermark: true,
  origin: 'https://clipmkr.ru', code: 'WWWWWW', teaser: true, title: 'Заголовок' };
afterEach(() => vi.restoreAllMocks());
it('layout measured width, shrinking, words and oversized word ellipsis', () => {
  const title = 'Как изменить свою жизнь и построить успешный бизнес без лишних расходов и потери времени';
  const samples = [34, 51, 69].map(length => title.slice(0, length));
  expect(samples.map(text => text.length)).toEqual([34, 51, 69]);
  for (const text of [...samples, 'WWWW'.repeat(80), 'слово '.repeat(80)]) {
    const layout = layoutTeaser(text, 1080)!;
    expect(layout).not.toBeNull(); expect(layout.lines.length).toBeLessThanOrEqual(3);
    expect(layout.fontSize).toBeGreaterThanOrEqual(60); expect(layout.fontSize).toBeLessThanOrEqual(84);
    for (const line of layout.lines) expect(measureText(line, layout.fontSize)).toBeLessThanOrEqual(972);
  }
  expect(layoutTeaser('WWWW'.repeat(80), 1080)?.lines.join('')).toMatch(/…$/);
  expect(layoutTeaser('слово '.repeat(80), 1080)?.lines.at(-1)).toMatch(/слово…$/);
  expect(layoutTeaser('короткий', 1080)?.fontSize).toBe(84);
  expect(layoutTeaser('слово '.repeat(21), 1080)?.fontSize).toBeLessThan(84);
  expect(layoutTeaser('word', 100)).toBeNull();
});
it('normalization and glyph failure stay inside pure layout', () => {
  expect(layoutTeaser(' \tПервая\r\nстрока  ', 1080)?.lines).toEqual(['Первая строка']);
  expect(layoutTeaser(' \n ', 1080)).toBeNull();
  expect(layoutTeaser('Привет 😀', 1080)).toBeNull();
  expect(layoutTeaser('\ud800', 1080)).toBeNull();
});
it('injection stays literal in protected textfile; path is escaped, no trailing newline', async () => {
  const dir = await mkdtemp('/tmp/teaser-');
  const title = "' : \\ %{pts} [0:v] ;";
  try {
    const prepared = await prepareTeaser(title, 1080, dir);
    expect(prepared).not.toBeNull();
    expect(await readFile(`${dir}/teaser.txt`, 'utf8')).toBe(title);
    expect((await stat(`${dir}/teaser.txt`)).mode & 0o777).toBe(0o600);
    expect(prepared!.filter).not.toContain(title);
    expect(prepared!.filter).toContain('textfile='); expect(prepared!.filter).toContain('expansion=none');
    expect(prepared!.filter).toContain('text_align=C');
    expect(prepared!.filter.match(/drawtext=/g)).toHaveLength(1);
    expect(buildTeaserFilter('/tmp/a:b.txt', 84)).toContain('a\\:b.txt');
    await prepareTeaser(' First\r\n second\tthird ', 1080, dir);
    expect(await readFile(`${dir}/teaser.txt`, 'utf8')).toBe('First second third');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('order is ass < teaser < flash < watermark and subtitles stay active', () => {
  const teaser = buildTeaserFilter('/tmp/teaser.txt', 84);
  const filter = buildFilterChain('portrait', '/tmp/sub.ass', true, options.origin, options.code,
    undefined, undefined, undefined, 'eq=brightness=0', teaser);
  expect(filter.indexOf('ass=')).toBeLessThan(filter.indexOf('textfile='));
  expect(filter.indexOf('textfile=')).toBeLessThan(filter.indexOf('eq='));
  expect(filter.indexOf('eq=')).toBeLessThan(filter.indexOf('drawbox='));
  expect(filter).toContain("enable='lt(t,2.5)'");
  expect(filter).toContain(`alpha='if(lt(t,${TEASER_SECONDS - TEASER_FADE_SECONDS}),1,max(0,(${TEASER_SECONDS}-t)/${TEASER_FADE_SECONDS}))'`);
});
it('safe area and no intersections with subtitle or watermark zones', () => {
  const h = 1920, g = watermarkGeometry(1080, h, options.origin, options.code);
  const y0 = TEASER_Y * h;
  expect(y0 - TEASER_BOX_BORDER_WIDTH).toBeGreaterThanOrEqual(0.14 * h);
  const bottom = y0 + TEASER_MAX_LINES * Math.ceil(1.25 * TEASER_FONT_SIZE) + 2 * TEASER_BOX_BORDER_WIDTH;
  expect(bottom).toBeLessThan(g.y);
  expect(bottom).toBeLessThan(h - 500 - 2 * Math.ceil(1.25 * SUBTITLE_FONT_SIZE));
  expect(buildTeaserFilter('/tmp/t.txt', 84)).toContain(`y=${TEASER_Y}*h`);
});
it('emoji skips teaser and render succeeds with one encode, never watermark_geometry', async () => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect((await renderClip({ ...options, title: 'Привет 😀' })).teaser).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'teaser_skipped', reason: 'glyph_missing' }));
  expect(encode).toHaveBeenCalledTimes(1);
  expect(encode.mock.calls[0]![0].join(' ')).not.toContain('textfile=');
});
it('render uses textfile once and returns actual layout; off means no overlay', async () => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  let text = '';
  const encode = vi.spyOn(exec, 'execFFmpeg').mockImplementation(async args => {
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    const path = filter.match(/textfile='([^']+)'/)?.[1];
    if (path) text = await readFile(path, 'utf8');
  });
  const result = await renderClip(options);
  expect(result.teaser).toEqual({ lines: ['Заголовок'], font_size: 84 }); expect(text).toBe('Заголовок');
  expect(encode).toHaveBeenCalledTimes(1);
  expect((await renderClip({ ...options, teaser: false })).teaser).toBeNull();
  expect(encode.mock.calls[1]![0].join(' ')).not.toContain('textfile=');
  expect((await renderClip({ ...options, title: '   ' })).teaser).toBeNull();
});
it('SL-008 invalid watermark geometry precedes all ffmpeg calls', async () => {
  const check = vi.spyOn(probe, 'probeVideoStream');
  const encode = vi.spyOn(exec, 'execFFmpeg');
  await expect(renderClip({ ...options, code: 'W'.repeat(10) })).rejects.toThrow();
  expect(check).not.toHaveBeenCalled(); expect(encode).not.toHaveBeenCalled();
});
it('strict teaser schema accepts only optional boolean', () => {
  const body = { filename: 'a.mp3', declared_bytes: 24, source: 'upload' };
  expect(createVideoSchema.parse(body).teaser).toBeUndefined();
  expect(createVideoSchema.parse({ ...body, teaser: true }).teaser).toBe(true);
  for (const extra of [{ teaser: null }, { teaser: 'true' }, { extra: true }]) {
    expect(createVideoSchema.safeParse({ ...body, ...extra }).success).toBe(false);
  }
});
it.each([NaN, Infinity, 1.5])('invalid clip index %s logs fallback', async clipIndex => {
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(music, 'prepareMusic').mockResolvedValue(null);
  await renderClip({ ...options, teaser: false, music: true, clipIndex });
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'music_track_fallback' }));
  log.mockClear();
  for (const enabled of [false, undefined]) {
    await renderClip({ ...options, teaser: false, music: enabled, clipIndex });
    expect(log).not.toHaveBeenCalledWith(JSON.stringify({ event: 'music_track_fallback' }));
  }
});

it('preparation failure skips visibly instead of refusing clip', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(await prepareTeaser('Заголовок', 1080, '/no-such-teaser-directory')).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'teaser_skipped', reason: 'prepare_failed' }));
});
