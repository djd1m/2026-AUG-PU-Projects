// One-line brand/address with an inverse code chip; fixed font and safe margins.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { escapeDrawtext, escapeFFmpegPath } from './escape.js';
export const FONT_FILE = resolve('apps/worker/assets/fonts/ClipMakerNarrow-Bold.ttf');
export const SUBTITLE_FONTS = resolve('apps/worker/assets/fonts');
import { watermarkGeometry, RENDER_FONT_SHA256 } from '@clipmaker/shared/watermark';
export { watermarkGeometry, measureText, RENDER_FONT_SHA256 } from '@clipmaker/shared/watermark';
export const WATERMARK_OPACITY = 0.60;
export function checkRenderFont(): void {
  if (createHash('sha256').update(readFileSync(FONT_FILE)).digest('hex') !== RENDER_FONT_SHA256) {
    throw new Error('Файл шрифта метки не совпадает с измеренными метриками');
  }
}
export function watermarkRequired(plan: unknown): boolean { return plan !== 'paid'; }
export function buildWatermarkDrawtext(width: number, height: number, origin: string, code: string): string {
  const g = watermarkGeometry(width, height, origin, code);
  const textY = g.y + g.paddingY, chipX = g.left + g.paddingX + g.prefixWidth;
  const drawText = (text: string, x: number, color: string) =>
    `drawtext=text='${escapeDrawtext(text)}':expansion=none:fontfile='${escapeFFmpegPath(FONT_FILE)}':` +
    `fontsize=${g.fontSize}:fontcolor=${color}:x=${x}:y=${textY + g.fontSize}-ascent`;
  return [
    `drawbox=x=${g.left}:y=${g.y}:w=${g.plateWidth}:h=${g.plateHeight}:color=black@${WATERMARK_OPACITY}:t=fill`,
    drawText(g.prefix, g.left + g.paddingX, 'white'),
    `drawbox=x=${chipX}:y=${textY}:w=${g.chipWidth}:h=${g.chipHeight}:color=white:t=fill`,
    drawText(g.code, chipX + g.chipPadding, 'black'),
  ].join(',');
}
