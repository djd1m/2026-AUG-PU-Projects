// Adapted from jan-clone: word timestamps, clip-relative events, no more than two lines.
import type { TranscriptWord } from '@clipmaker/shared/transcript';
import { FORMAT_DIMENSIONS, type ClipFormat } from './format.js';
import { escapeAssText } from './escape.js';
export type SubtitleSegment = TranscriptWord;
export function formatASSTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  let cs = Math.round((seconds % 1) * 100);
  if (cs >= 100) cs = 99; // Clamp rounding overflow
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
export function wrapSubtitleText(text: string, maxChars: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine.length > 0 ? currentLine + ' ' + word : word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\\N');
}
// User backslashes must never become ASS control sequences; braces stay visible data.
const literal = (text: string) => escapeAssText(text.replace(/\\/g, '＼').replace(/[\r\n]/g, ' '));
export function generateSubtitleFile(words: SubtitleSegment[], start: number, end: number, format: ClipFormat): string | null {
  const selected = words.filter(w => w.start >= start && w.end <= end && w.end > w.start);
  if (!selected.length) return null;
  const { width, height } = FORMAT_DIMENSIONS[format];
  const groups: SubtitleSegment[][] = [];
  let group: SubtitleSegment[] = [];
  for (const word of selected) {
    if (group.length && wrapSubtitleText([...group, word].map(w => w.word).join(' '), 32).split('\\N').length > 2) {
      groups.push(group); group = [];
    }
    group.push(word);
  }
  if (group.length) groups.push(group);
  const events: string[] = [];
  for (const words of groups) {
    for (const [index, active] of words.entries()) {
      const stop = Math.min(active.end, words[index + 1]?.start ?? end);
      if (stop <= active.start) continue;
      let lineLength = 0;
      const text = words.map((w, i) => {
        const newline = lineLength > 0 && lineLength + w.word.length + 1 > 32;
        const prefix = i === 0 ? '' : newline ? '\\N' : ' ';
        lineLength = newline ? w.word.length : lineLength + w.word.length + (i ? 1 : 0);
        const safe = literal(w.word);
        return prefix + (i === index ? `{\\c&H00FFFF&}${safe}{\\c&HFFFFFF&}` : safe);
      }).join('');
      events.push(`Dialogue: 0,${formatASSTimecode(active.start - start)},${formatASSTimecode(stop - start)},Default,,0,0,0,,${text}`);
    }
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Liberation Sans Narrow,68,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,54,54,500,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}
