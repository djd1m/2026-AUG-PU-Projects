import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { watermarkRequired, watermarkGeometry, buildWatermarkDrawtext, checkRenderFont, measureText } from '../apps/worker/src/render/watermark';
import { buildFilterChain } from '../apps/worker/src/render/ffmpeg';
import { generateSubtitleFile, wrapSubtitleText, formatASSTimecode } from '../apps/worker/src/render/subtitles';
import { escapeDrawtext, escapeFFmpegPath, escapeAssText } from '../apps/worker/src/render/escape';
const origin = 'https://clipmaker.aicoding.space', code = 'WWWWWWWWWW';
it.each([null, undefined, '', 'PAID', ' paid', 'premium', 0, true, 'free'])('ADR-004 fails closed for %s', plan => {
  expect(watermarkRequired(plan)).toBe(true);
});
it('only exact paid removes watermark', () => expect(watermarkRequired('paid')).toBe(false));
it('two lines fit including background, and obey font size, margins, contrast', () => {
  checkRenderFont();
  const g = watermarkGeometry(1080, 1920, origin, code);
  expect(g.lines).toEqual(['КлипМейкер', `clipmaker.aicoding.space/c/${code}`]);
  expect(g.fontSize).toBeGreaterThanOrEqual(1920 * .035);
  expect(g.left).toBeGreaterThanOrEqual(1080 * .05); expect(g.bottom).toBeGreaterThanOrEqual(1920 * .12);
  for (const w of g.widths) expect(w + 2 * g.padding).toBeLessThanOrEqual(1080 - 2 * g.left);
  expect(g.contrast).toBeGreaterThanOrEqual(4.5);
  expect(measureText(g.lines.join(' · '), g.fontSize) + 2 * g.padding).toBeGreaterThan(1080 - 2 * g.left);
  expect(() => watermarkGeometry(1080, 1920, 'https://' + 'x'.repeat(100) + '.com', code)).toThrow(/не помещается/);
});
it('fontfile only; font bytes are pinned and shipped in runtime image', () => {
  const source = readFileSync('apps/worker/src/render/watermark.ts', 'utf8');
  expect(source).not.toMatch(/\bfont=/); expect(source).toContain('fontfile=');
  const filter = buildWatermarkDrawtext(1080, 1920, origin, code);
  expect(filter).not.toMatch(/\bfont=/); expect(filter).toContain('fontfile=');
  expect(filter).toContain(`/c/${code}`); expect(filter).toContain('boxcolor=black');
  expect(readFileSync('Dockerfile', 'utf8')).toContain('COPY --from=build /app/apps/worker/assets ./apps/worker/assets');
});
it('filter order in source and graph: scale crop ASS watermark last', () => {
  const source = readFileSync('apps/worker/src/render/ffmpeg.ts', 'utf8');
  expect(source.indexOf('filters.push(getScaleFilter')).toBeLessThan(source.indexOf('filters.push(`ass='));
  expect(source.indexOf('filters.push(`ass=')).toBeLessThan(source.indexOf('filters.push(buildWatermarkDrawtext'));
  const graph = buildFilterChain('portrait', '/tmp/subtitles.ass', true, origin, code);
  expect(graph.indexOf('scale=')).toBeLessThan(graph.indexOf('crop='));
  expect(graph.indexOf('crop=')).toBeLessThan(graph.indexOf('ass='));
  expect(graph.indexOf('ass=')).toBeLessThan(graph.indexOf('drawtext='));
  expect(graph).not.toContain('pad=');
  expect(buildFilterChain('portrait', null, false, origin, code)).not.toMatch(/drawtext|ass=/);
});
it('ADR-006 actual registered render worker has literal concurrency one', () => {
  const source = readFileSync('apps/worker/src/workers/render.ts', 'utf8');
  expect(source).toMatch(/\{ connection, concurrency: 1, maxStalledCount: 1 \}/);
  expect(readFileSync('apps/worker/src/runtime.ts', 'utf8')).toContain('worker = createRenderWorker(connection,');
});
it('link created before render lease and enqueue; SQL rejects late creation', () => {
  const source = readFileSync('packages/db/src/selection.ts', 'utf8');
  expect(source.indexOf('await createClipLink(tx, id)')).toBeGreaterThan(0);
  expect(source.indexOf('await createClipLink(tx, id)')).toBeLessThan(source.indexOf("leaseAttemptTx(tx, attempt.video_id, 'render'"));
  expect(readFileSync('packages/db/migrations/008_render.sql', 'utf8')).toContain('BEFORE INSERT ON job_attempt');
});
describe('transferred subtitle and escaping helpers', () => {
  it('retains donor helpers and Cyrillic word wrapping', () => {
    expect(wrapSubtitleText('Привет прекрасный мир', 16)).toBe('Привет\\Nпрекрасный мир');
    expect(formatASSTimecode(3661.999)).toBe('1:01:01.99');
    expect(escapeDrawtext("a:b'c\\")).toBe("a\\:b\\'c\\\\");
    expect(escapeFFmpegPath('a:b')).toBe('a\\:b'); expect(escapeAssText('{x}')).toBe('\\{x\\}');
  });
  it('uses word-relative times and escapes style injection; empty selection is absent', () => {
    const words = [{ word: 'Привет', start: 10, end: 11 }, { word: '{\\pos(0,0)}', start: 11, end: 12 }];
    const ass = generateSubtitleFile(words, 10, 30, 'portrait')!;
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.00');
    expect(ass).toContain('{\\c&H00FFFF&}Привет'); expect(ass).not.toContain('{\\pos(');
    expect(ass).toContain('\\{＼pos(0,0)\\}');
    expect(generateSubtitleFile(words, 20, 40, 'portrait')).toBeNull();
  });
  it('limits subtitle groups to two lines, preserves words', () => {
    const words = Array.from({ length: 15 }, (_, i) => ({ word: 'кириллическое', start: i, end: i + 1 }));
    const lines = generateSubtitleFile(words, 0, 20, 'portrait')!.split('\n').filter(l => l.startsWith('Dialogue:'));
    expect(lines).toHaveLength(15);
    for (const line of lines) expect(line.split('\\N').length).toBeLessThanOrEqual(2);
  });
});
