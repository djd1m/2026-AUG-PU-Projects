// Adapted from jan-clone: word timestamps, clip-relative events, no more than two lines.
import type { TranscriptWord } from '@clipmaker/shared/transcript';
import { FORMAT_DIMENSIONS, type ClipFormat } from './format.js';
import { escapeAssText } from './escape.js';
import { applyGlossary, parseGlossary } from './glossary.js';

/**
 * Кегль субтитров и перенос строки связаны ЖЁСТКО: чем крупнее буквы, тем меньше их помещается.
 * Было 68 и 32 знака. Владелец 23.09.2026: «увеличь кегль и обводку» — для вертикального видео
 * прежнее было скромно.
 *
 * Перенос ИЗМЕРЕН отрисовкой, а не выведен из средней ширины знака. Первый расчёт дал 26 знаков,
 * и настоящая фраза из записи владельца («специализированные железяки», 27 знаков) заняла 978 px
 * при полезных 972 — то есть залезла в поле. Измерение: 36,2 px на знак при кегле 86.
 *
 * 24 знака дают 869 px и 103 px запаса. Запас нужен: прописные буквы шире строчных почти в
 * полтора раза (измерено 45,7 px против 36,2), и строка из аббревиатур съест его целиком.
 */
export const SUBTITLE_FONT_SIZE = 86;
export const SUBTITLE_OUTLINE = 5;
/** Лёгкая тень: обводка спасает на пёстром фоне, тень добавляет отрыв от светлого. */
export const SUBTITLE_SHADOW = 1;
export const SUBTITLE_WRAP_CHARS = 24;
/** Сколько держать подпись после конца слова, если следующее не началось. */
export const SUBTITLE_HOLD_SECONDS = 1;
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
    if (group.length && wrapSubtitleText([...group, word].map(w => w.word).join(' '), SUBTITLE_WRAP_CHARS).split('\\N').length > 2) {
      groups.push(group); group = [];
    }
    group.push(word);
  }
  if (group.length) groups.push(group);
  const glossary = parseGlossary(process.env.N5_GLOSSARY);
  const events: string[] = [];
  // События идут ВСТЫК, а не по длительности слова.
  //
  // Было `min(конец слова, начало следующего)`: между словами почти всегда есть пауза, событие
  // кончалось раньше следующего, и вся плашка субтитров ИСЧЕЗАЛА на этот промежуток, а потом
  // появлялась снова. Владелец увидел это как «моргает транскрипт» (23.09.2026) — и был прав:
  // при речи в 2–3 слова в секунду плашка мигала десятки раз за клип.
  //
  // Теперь подпись висит непрерывно, а внутри неё переезжает только подсветка текущего слова.
  // Последнее слово группы держится до начала следующей группы, а последней группы — до конца клипа.
  for (const [groupIndex, words] of groups.entries()) {
    const groupEnd = groups[groupIndex + 1]?.[0]?.start ?? end;
    for (const [index, active] of words.entries()) {
      // Встык — но не бесконечно. Промежуток меньше секунды перекрывается (от таких и было
      // мигание), настоящая пауза — нет: иначе последняя реплика висела бы до конца клипа, и
      // зритель секундами смотрел бы на застывший текст после того, как речь кончилась.
      const stop = Math.min(words[index + 1]?.start ?? groupEnd, active.end + SUBTITLE_HOLD_SECONDS);
      if (stop <= active.start) continue;
      let lineLength = 0;
      const text = words.map((w, i) => {
        const newline = lineLength > 0 && lineLength + w.word.length + 1 > SUBTITLE_WRAP_CHARS;
        const prefix = i === 0 ? '' : newline ? '\\N' : ' ';
        lineLength = newline ? w.word.length : lineLength + w.word.length + (i ? 1 : 0);
        const safe = literal(applyGlossary(w.word, glossary));
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
Style: Default,Liberation Sans Narrow,${SUBTITLE_FONT_SIZE},&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${SUBTITLE_OUTLINE},${SUBTITLE_SHADOW},2,54,54,500,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}
