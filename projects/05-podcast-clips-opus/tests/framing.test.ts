import { expect, it } from 'vitest';
import { getFramingFilter, panelWindow, selectFraming } from '../apps/worker/src/render/format';
import { buildFilterChain } from '../apps/worker/src/render/ffmpeg';
import { buildWatermarkDrawtext } from '../apps/worker/src/render/watermark';

it('FR-1 landscape uses both halves with even 960x852 windows and upper bias', () => {
  const source = { width: 1920, height: 1080 };
  expect(selectFraming(source)).toBe('dual');
  // Brief's nominal 960x853 is aligned down for yuv420p.
  expect(Math.round(960 / 1.125)).toBe(853);
  expect(panelWindow(source, 0)).toEqual({ width: 960, height: 852, x: 0, y: 56 });
  expect(panelWindow(source, 1)).toEqual({ width: 960, height: 852, x: 960, y: 56 });
  expect(panelWindow(source, 0.5, 0)).toMatchObject({ x: 480, y: 0 });
  // Два этажа строятся только по ЯВНОМУ плану (FR-2): без плана — обрезка центра.
  expect(getFramingFilter('portrait', source, { mode: 'dual' as const, positions: [{ x: 0, y: 0.25 }, { x: 1, y: 0.25 }] })).toContain('[top][bottom]vstack=inputs=2');
  expect(getFramingFilter('portrait', source)).not.toContain('split=');
});
it.each([[1080, 1920], [1080, 1080]])('FR-1 vertical or square %ix%i retains center crop', (width, height) => {
  expect(selectFraming({ width, height })).toBe('center');
  expect(getFramingFilter('portrait', { width, height })).not.toContain('split=');
});
it.each([[640, 360], [959, 540]])('FR-1 narrow %ix%i retains center crop', (width, height) => {
  expect(selectFraming({ width, height })).toBe('center');
});
it('FR-1 exactly 480 pixels qualifies; shallow source clamps window to source height', () => {
  expect(selectFraming({ width: 960, height: 540 })).toBe('dual');
  expect(panelWindow({ width: 1920, height: 400 }, 1)).toEqual({ width: 450, height: 400, x: 1470, y: 0 });
});
it('FR-1 odd sources always produce even windows and in-bounds even positions', () => {
  for (let width = 959; width < 2000; width += 13) {
    for (let height = 3; height < 1100; height += 17) {
      for (const position of [0, 0.5, 1]) {
        const w = panelWindow({ width, height }, position);
        for (const n of [w.width, w.height, w.x, w.y]) expect(n % 2).toBe(0);
        expect(w.width).toBeGreaterThanOrEqual(2); expect(w.height).toBeGreaterThanOrEqual(2);
        expect(w.x + w.width).toBeLessThanOrEqual(width);
        expect(w.y + w.height).toBeLessThanOrEqual(height);
      }
    }
  }
});
it('FR-1 rejects invalid dimensions and positions', () => {
  for (const width of [0, -1, 1, 1.5, NaN, Infinity]) expect(() => selectFraming({ width, height: 1080 })).toThrow();
  expect(() => panelWindow({ width: 1920, height: 1080 }, -0.1)).toThrow();
});
it('FR-1 assembly precedes ASS and watermark remains last', () => {
  const graph = buildFilterChain('portrait', '/tmp/subtitles.ass', true, 'https://clipmkr.ru', 'WWWWWW', { width: 1920, height: 1080 }, { mode: 'dual' as const, positions: [{ x: 0, y: 0.25 }, { x: 1, y: 0.25 }] });
  expect(graph.indexOf('vstack=')).toBeGreaterThan(0);
  expect(graph.indexOf('ass=')).toBeGreaterThan(graph.indexOf('vstack='));
  expect(graph.indexOf('drawbox=')).toBeGreaterThan(graph.indexOf('ass='));
  expect(graph.endsWith(buildWatermarkDrawtext(1080, 1920, 'https://clipmkr.ru', 'WWWWWW'))).toBe(true);
});
