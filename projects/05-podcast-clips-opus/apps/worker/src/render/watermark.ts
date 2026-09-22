// Adapted from jan-clone: two opaque lines, fixed file, >=3.5% height, safe margins.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { escapeDrawtext, escapeFFmpegPath } from './escape.js';
export const FONT_FILE = resolve('apps/worker/assets/fonts/ClipMakerNarrow-Bold.ttf');
export const SUBTITLE_FONTS = resolve('apps/worker/assets/fonts');
const metrics: { sha256: string; unitsPerEm: number; advance: Record<string, number> } =
  JSON.parse(readFileSync(resolve('apps/worker/assets/fonts/metrics.json'), 'utf8'));
export const RENDER_FONT_SHA256 = metrics.sha256;
export function checkRenderFont(): void {
  if (createHash('sha256').update(readFileSync(FONT_FILE)).digest('hex') !== metrics.sha256) {
    throw new Error('Файл шрифта метки не совпадает с измеренными метриками');
  }
}
export function watermarkRequired(plan: unknown): boolean { return plan !== 'paid'; }
export function measureText(text: string, fontSize: number): number {
  // Per-glyph ceiling bounds FreeType pixel rounding; kerning is absent in this font.
  return [...text].reduce((width, char) => {
    const advance = metrics.advance[String(char.codePointAt(0))];
    if (advance === undefined) throw new Error('Шрифт не содержит символ метки');
    return width + Math.ceil(advance * fontSize / metrics.unitsPerEm);
  }, 0);
}
export function watermarkGeometry(width: number, height: number, origin: string, code: string) {
  const url = new URL(origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Непригодный адрес метки');
  const lines = ['КлипМейкер', `${url.host}/c/${code}`];
  const fontSize = Math.ceil(height * 0.035), padding = 8, gap = 12;
  const left = Math.ceil(width * 0.05), bottom = Math.ceil(height * 0.12);
  const widths = lines.map(text => measureText(text, fontSize));
  if (widths.some(w => w + 2 * padding > width - 2 * left)) throw new Error('Адрес метки не помещается в безопасную область');
  return { lines, widths, fontSize, padding, left, bottom, gap,
    y: height - bottom - 2 * fontSize - gap - padding, contrast: 21 };
}
export function buildWatermarkDrawtext(width: number, height: number, origin: string, code: string): string {
  const g = watermarkGeometry(width, height, origin, code);
  return g.lines.map((text, i) =>
    `drawtext=text='${escapeDrawtext(text)}':expansion=none:fontfile='${escapeFFmpegPath(FONT_FILE)}':` +
    `fontsize=${g.fontSize}:fontcolor=white:box=1:boxcolor=black:boxborderw=${g.padding}:` +
    `x=${g.left + g.padding}:y=${g.y + i * (g.fontSize + g.gap)}`
  ).join(',');
}
