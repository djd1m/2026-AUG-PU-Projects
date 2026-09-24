import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { measureText, WatermarkGeometryError } from '@clipmaker/shared/watermark';
import { FONT_FILE } from './watermark.js';
import { escapeFFmpegPath } from './escape.js';
export const TEASER_FONT_SIZE = 84;
export const TEASER_MIN_FONT_SIZE = 60;
export const TEASER_MAX_LINES = 3;
export const TEASER_SECONDS = 2.5;
export const TEASER_Y = 0.17;
export interface TeaserResult { lines: string[]; font_size: number }
const normalize = (title: string) => title.replace(/\s+/gu, ' ').trim();
// Pure, conservative layout. Unsupported glyphs must never escape as watermark failures.
export function layoutTeaser(title: string, width: number): { lines: string[]; fontSize: number } | null {
  try {
    const text = normalize(title), available = width - 2 * 54;
    if (!text || !Number.isFinite(available) || available <= 0) return null;
    const words = text.split(' ');
    for (let fontSize = TEASER_FONT_SIZE; fontSize >= TEASER_MIN_FONT_SIZE; fontSize -= 4) {
      const lines: string[] = [];
      let line = '', oversized = false;
      for (const word of words) {
        if (measureText(word, fontSize) > available) oversized = true;
        const candidate = line ? `${line} ${word}` : word;
        if (line && measureText(candidate, fontSize) > available) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
      if (!oversized && lines.length <= TEASER_MAX_LINES) return { lines, fontSize };
    }
    // At minimum size, preserve whole words where possible. A single oversized word
    // ends the teaser at a character boundary; the ellipsis is included in measurement.
    const fontSize = TEASER_MIN_FONT_SIZE, lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!, candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, fontSize) <= available) { line = candidate; continue; }
      if (line && lines.length < TEASER_MAX_LINES - 1) { lines.push(line); line = ''; i--; continue; }
      let tail = line || word;
      while (tail && measureText(tail + '…', fontSize) > available) {
        const space = tail.lastIndexOf(' ');
        tail = space >= 0 ? tail.slice(0, space) : [...tail].slice(0, -1).join('');
      }
      if (measureText(tail + '…', fontSize) > available) return null;
      lines.push(tail + '…');
      return { lines, fontSize };
    }
    if (line) lines.push(line);
    return { lines, fontSize };
  } catch { return null; }
}
export function buildTeaserFilter(path: string, fontSize: number): string {
  return `drawtext=textfile='${escapeFFmpegPath(path)}':expansion=none:fontfile='${escapeFFmpegPath(FONT_FILE)}':` +
    `fontsize=${fontSize}:fontcolor=white:text_align=C:x=(w-text_w)/2:y=${TEASER_Y}*h:` +
    `box=1:boxcolor=black@0.55:boxborderw=24:enable='lt(t,${TEASER_SECONDS})':` +
    "alpha='if(lt(t,2.2),1,max(0,(2.5-t)/0.3))'";
}
export async function prepareTeaser(title: string, width: number, directory: string) {
  const skip = (reason: string) => { console.info(JSON.stringify({ event: 'teaser_skipped', reason })); return null; };
  try {
    const normalized = normalize(title);
    if (!normalized) return skip('empty');
    measureText(normalized, TEASER_FONT_SIZE);
    const layout = layoutTeaser(normalized, width);
    if (!layout) return skip('layout_failed');
    const path = join(directory, 'teaser.txt');
    await writeFile(path, layout.lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    return { result: { lines: layout.lines, font_size: layout.fontSize }, filter: buildTeaserFilter(path, layout.fontSize) };
  } catch (error) { return skip(error instanceof WatermarkGeometryError ? 'glyph_missing' : 'prepare_failed'); }
}
