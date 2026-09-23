import fontMetrics from './watermark-metrics.json';
import { CLIP_CODE_ALPHABET, clipCodeLength } from './clip-code.js';
import { FORMAT_DIMENSIONS } from './formats.js';
const metrics: { sha256: string; unitsPerEm: number; advance: Record<string, number> } = fontMetrics;
export const RENDER_FONT_SHA256 = metrics.sha256;
export function measureText(text: string, fontSize: number): number {
  // Per-glyph ceiling bounds FreeType pixel rounding; kerning is absent in this font.
  return [...text].reduce((width, char) => {
    const advance = metrics.advance[String(char.codePointAt(0))];
    if (advance === undefined) throw new Error('Шрифт не содержит символ метки');
    return width + Math.ceil(advance * fontSize / metrics.unitsPerEm);
  }, 0);
}
function watermarkFontSize(height: number): number { return Math.ceil(height * 73 / 1920); }
export function watermarkGeometry(width: number, height: number, origin: string, code: string) {
  const url = new URL(origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Непригодный адрес метки');
  const prefix = `КлипМейкер · ${url.host}/c/`;
  const fontSize = watermarkFontSize(height), paddingX = 24, paddingY = 16, chipPadding = 16;
  const left = Math.ceil(width * 0.05), bottom = Math.ceil(height * 0.12);
  const prefixWidth = measureText(prefix, fontSize), codeWidth = measureText(code, fontSize);
  const chipWidth = codeWidth + 2 * chipPadding, chipHeight = Math.ceil(fontSize * 1.15);
  const plateWidth = 2 * paddingX + prefixWidth + chipWidth, plateHeight = 2 * paddingY + chipHeight;
  // Runtime enforces the canonical safe area: 972 px at 1080 width.
  // The stricter 880 px stories target is asserted by the reference-domain test only.
  if (plateWidth > width - 2 * left) throw new Error(
    `Адрес метки не помещается в безопасную область: ширина ${plateWidth} px, предел ${width - 2 * left} px`);
  return { prefix, code, prefixWidth, codeWidth, fontSize, paddingX, paddingY, chipPadding,
    chipWidth, chipHeight, plateWidth, plateHeight, left, bottom, y: height - bottom - plateHeight };
}

export function assertWatermarkFits(origin: string, rawLength: string | undefined): void {
  const length = clipCodeLength(rawLength);
  for (const [format, { width, height }] of Object.entries(FORMAT_DIMENSIONS)) {
    const fontSize = watermarkFontSize(height);
    const widest = [...CLIP_CODE_ALPHABET].reduce((best, char) =>
      measureText(char, fontSize) > measureText(best, fontSize) ? char : best);
    try {
      watermarkGeometry(width, height, origin, widest.repeat(length));
    } catch (error) {
      throw new Error(`N5_PUBLIC_ORIGIN непригодно при N5_SHORT_CODE_LENGTH=${length}, формат ${format}: ` +
        `${error instanceof Error ? error.message : 'геометрия недоступна'}. ` +
        'Запуск остановлен до приёма загрузок: иначе минуты будут списаны, Whisper и выделение оплачены, а рендер откажет.');
    }
  }
}
