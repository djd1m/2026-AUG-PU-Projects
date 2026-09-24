import { expect, it } from 'vitest';
import { buildCutPlan, mapTime, planDuration, planCuts, buildCompactionGraph } from '../apps/worker/src/render/compaction';
const envelope = (duration: number, pauses: [number, number][]) => Array.from({ length: duration * 50 }, (_, i) => pauses.some(([s, e]) => i / 50 >= s && i / 50 < e) ? -70 : -20);
it('only interior pauses 0.30–2 seconds; quantized source boundaries', () => {
  const p = buildCutPlan(envelope(35, [[0.1, 0.4], [4, 4.2], [8, 8.5], [14, 15], [20, 22.5]]), -20, 100, 135);
  expect(p).toHaveLength(3);
  expect(p[0]![1]).toBeCloseTo(108.08); expect(p[1]![0]).toBeCloseTo(108.44);
  for (const segment of p) for (const t of segment) expect(t * 25).toBeCloseTo(Math.round(t * 25));
});
it('minimum output has one frame margin; minimum saving 3%; no pauses', () => {
  expect(planCuts(envelope(20.96, [[4, 5]]), -20, 0, 20.96).reason).toBe('too_short');
  expect(planCuts(envelope(50, [[4, 4.5]]), -20, 0, 50).reason).toBe('small_saving');
  expect(buildCutPlan(envelope(30, []), -20, 1.123, 31.123)).toEqual([[1.123, 31.123]]);
});
it('mapTime clamps and is monotone including both sides of every overlap', () => {
  const plan: [number, number][] = [[10, 20], [21, 32], [34, 45]];
  expect(mapTime(plan, 0)).toBe(0); expect(mapTime(plan, 100)).toBe(planDuration(plan));
  expect(mapTime(plan, 20.1)).toBeCloseTo(9.96);
  expect(mapTime(plan, 19.92)).toBeCloseTo(mapTime(plan, 21.08));
  let previous = 0;
  for (let t = 9; t < 46; t += .001) { const mapped = mapTime(plan, t); expect(mapped).toBeGreaterThanOrEqual(previous - 1e-9); previous = mapped; }
});
it('relative trims, normalized VFR and audio-only graph', () => {
  const plan: [number, number][] = [[10, 20], [21, 35]];
  const graph = buildCompactionGraph(plan, 10, 2);
  expect(graph).toContain('[0:2]trim=0:10,setpts=PTS-STARTPTS,fps=25,format=yuv420p,settb=AVTB');
  expect(graph).toContain('offset=9.92[vc]'); expect(graph).toContain('acrossfade=d=0.08[ac]');
  const audio = buildCompactionGraph(plan, 10, null);
  expect(audio).not.toContain('xfade='); expect(audio).toContain('[ac]');
});
