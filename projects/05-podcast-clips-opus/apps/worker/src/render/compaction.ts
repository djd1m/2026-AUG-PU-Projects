// OWN-012. Plans use source seconds; the render timeline is always 25 fps.
export const COMPACT_KEEP_SECONDS = 0.05;
export const COMPACT_XFADE_SECONDS = 0.08;
export const COMPACT_FPS = 25;
export const COMPACT_MIN_PAUSE = 0.30;
export const COMPACT_MAX_PAUSE = 2.0;
export const COMPACT_EDGE = 0.5;
export const COMPACT_THRESHOLD_BELOW_MEDIAN_DB = 18;
export const COMPACT_MIN_SAVING = 0.03;
export const ENVELOPE_SECONDS = 0.02;
export type Segment = [number, number];
// Runtime schema for JSON read from the database; no coercion of strings/null.
export function parseCutPlan(value: unknown, start: number, end: number): Segment[] {
  if (!Array.isArray(value) || !value.length || !Number.isFinite(start) || !Number.isFinite(end)
    || !value.every((pair, i) => Array.isArray(pair) && pair.length === 2
      && pair.every(n => typeof n === 'number' && Number.isFinite(n))
      && pair[0] >= start && pair[1] <= end && pair[0] < pair[1]
      && (i === 0 || pair[0] >= value[i - 1][1]))) {
    throw new Error('Непригодный cut_plan');
  }
  return value as Segment[];
}
const frame = (t: number) => Math.round(t * COMPACT_FPS) / COMPACT_FPS;
const ms = (t: number) => Math.round(t * 1000) / 1000;
export function planDuration(plan: Segment[]): number {
  const length = plan.reduce((sum, [s, e]) => sum + e - s, 0) - (plan.length - 1) * COMPACT_XFADE_SECONDS;
  return plan.length > 1 ? frame(length) : ms(length);
}
export function planCuts(envelopeDb: number[], median: number, start: number, end: number): {
  plan: Segment[]; reason?: 'too_short' | 'small_saving' | 'no_pauses';
} {
  const whole: Segment[] = [[start, end]];
  const plan: Segment[] = [];
  let cursor = Math.ceil(start * COMPACT_FPS) / COMPACT_FPS;
  for (let i = 0; i < envelopeDb.length;) {
    if (envelopeDb[i]! >= median - COMPACT_THRESHOLD_BELOW_MEDIAN_DB) { i++; continue; }
    const first = i++;
    while (i < envelopeDb.length && envelopeDb[i]! < median - COMPACT_THRESHOLD_BELOW_MEDIAN_DB) i++;
    const a = start + first * ENVELOPE_SECONDS, b = start + i * ENVELOPE_SECONDS;
    const length = ms(b - a);
    if (length < COMPACT_MIN_PAUSE || length > COMPACT_MAX_PAUSE || a - start < COMPACT_EDGE || end - b < COMPACT_EDGE) continue;
    const left = frame(a + (COMPACT_KEEP_SECONDS + COMPACT_XFADE_SECONDS) / 2);
    // Quantize the removed duration jointly: independent rounding of both ends can
    // leave 80 ms of silence. Joint rounding leaves K +/- 10 ms for 20 ms windows.
    const right = ms(left + frame(length - COMPACT_KEEP_SECONDS - COMPACT_XFADE_SECONDS));
    plan.push([ms(cursor), ms(left)]); cursor = right;
  }
  if (!plan.length) return { plan: whole, reason: 'no_pauses' };
  plan.push([ms(cursor), ms(Math.floor(end * COMPACT_FPS) / COMPACT_FPS)]);
  const duration = planDuration(plan);
  if (duration < 20 + 1 / COMPACT_FPS) return { plan: whole, reason: 'too_short' };
  if ((end - start - duration) / (end - start) < COMPACT_MIN_SAVING) return { plan: whole, reason: 'small_saving' };
  return { plan };
}
export function buildCutPlan(envelopeDb: number[], median: number, start: number, end: number): Segment[] {
  return planCuts(envelopeDb, median, start, end).plan;
}
export function mapTime(plan: Segment[], tSource: number): number {
  const xf = COMPACT_XFADE_SECONDS;
  let offset = 0;
  for (let k = 0; k < plan.length; k++) {
    const [s, e] = plan[k]!;
    if (k && tSource <= s + xf) return offset + xf / 2;
    if (k + 1 < plan.length && tSource >= e - xf && tSource <= plan[k + 1]![0] + xf) {
      return offset + e - s - xf / 2;
    }
    if (tSource <= e) return Math.max(0, offset + tSource - s);
    offset += e - s - xf;
  }
  return planDuration(plan);
}
export function buildCompactionGraph(plan: Segment[], start: number, videoIndex: number | null): string {
  const filters: string[] = [];
  plan.forEach(([s, e], i) => {
    const trim = `${ms(s - start)}:${ms(e - start)}`;
    if (videoIndex !== null) filters.push(`[0:${videoIndex}]trim=${trim},setpts=PTS-STARTPTS,fps=${COMPACT_FPS},format=yuv420p,settb=AVTB[v${i}]`);
    filters.push(`[0:a:0]atrim=${trim},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
  });
  let elapsed = plan[0]![1] - plan[0]![0];
  for (let i = 1; i < plan.length; i++) {
    const last = i === plan.length - 1;
    if (videoIndex !== null) filters.push(`[${i === 1 ? 'v0' : `vx${i - 1}`}][v${i}]xfade=transition=fade:duration=${COMPACT_XFADE_SECONDS}:offset=${ms(elapsed - COMPACT_XFADE_SECONDS)}[${last ? 'vc' : `vx${i}`}]`);
    filters.push(`[${i === 1 ? 'a0' : `ax${i - 1}`}][a${i}]acrossfade=d=${COMPACT_XFADE_SECONDS}[${last ? 'ac' : `ax${i}`}]`);
    elapsed += plan[i]![1] - plan[i]![0] - COMPACT_XFADE_SECONDS;
  }
  return filters.join(';');
}
