import schema from './fragments-schema.json';
import { parseTranscript, type TranscriptResult } from './transcript.js';
export const FRAGMENTS_SCHEMA = schema;
export const SELECTION_TARGET_MIN = 3;
export const SELECT_TIMEOUT_MS = 120_000;
export interface Fragment {
  start_seconds: number; end_seconds: number; title: string; score: number;
  score_hook: number; score_completeness: number; score_length: number;
  explain_hook: string; explain_completeness: string; explain_length: string;
}
export class FragmentSchemaError extends Error { constructor() { super('Нарушена схема фрагментов'); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const properties = schema.properties.fragments.items.properties;
// Target is 3–8, but honest 1/2 are accepted only if every candidate is valid.
// Invalid candidates reject the whole response; an empty result means failure.
export function parseCandidates(value: unknown): Fragment[] {
  if (!object(value) || Object.keys(value).length !== 1 || !Array.isArray(value.fragments)) throw new FragmentSchemaError();
  return value.fragments.map(item => {
    if (!object(item) || Object.keys(item).length !== Object.keys(properties).length ||
      Object.entries(properties).some(([key, rule]) => typeof item[key] !== (rule.type === 'integer' ? 'number' : rule.type))) throw new FragmentSchemaError();
    return item as unknown as Fragment;
  });
}
export function validFragment(f: Fragment, duration: number): boolean {
  for (const [key, rule] of Object.entries(properties)) {
    const value = f[key as keyof Fragment];
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (rule.type === 'integer' && !Number.isInteger(value)) ||
        ('minimum' in rule && value < rule.minimum) || ('maximum' in rule && value > rule.maximum)) return false;
    } else if (!value.trim() || ('pattern' in rule && !new RegExp(rule.pattern).test(value))) return false;
  }
  const length = f.end_seconds - f.start_seconds;
  return length >= schema.$defs.duration.minimum && length <= schema.$defs.duration.maximum && f.end_seconds <= duration &&
    f.score === f.score_hook + f.score_completeness + f.score_length;
}
export function validateFragments(value: unknown, transcript: TranscriptResult, duration: number): Fragment[] {
  const words = parseTranscript(transcript, duration).words;
  const nearest = (time: number, side: 'start' | 'end') => words.reduce((best, word) =>
    Math.abs(word[side] - time) < Math.abs(best - time) ? word[side] : best, words[0]![side]);
  const parsed = parseCandidates(value);
  if (parsed.some(f => !validFragment(f, duration))) return [];
  const candidates = parsed.map(f => ({ ...f,
    start_seconds: nearest(f.start_seconds, 'start'), end_seconds: nearest(f.end_seconds, 'end'),
  }));
  if (candidates.some(f => !validFragment(f, duration) || words.some(w =>
    (w.start < f.start_seconds && w.end > f.start_seconds) || (w.start < f.end_seconds && w.end > f.end_seconds)))) return [];
  candidates.sort((a, b) => b.score - a.score || a.start_seconds - b.start_seconds);
  const accepted: Fragment[] = [];
  for (const f of candidates) {
    if (!accepted.some(a => f.start_seconds < a.end_seconds && f.end_seconds > a.start_seconds)) accepted.push(f);
    if (accepted.length === schema.properties.fragments.maxItems) break;
  }
  return accepted;
}
