// Portrait output: two participants for wide sources, center crop otherwise (FR-1).
import { FORMAT_DIMENSIONS, type ClipFormat } from '@clipmaker/shared/formats';
export { FORMAT_DIMENSIONS, type ClipFormat } from '@clipmaker/shared/formats';
export interface SourceDimensions { width: number; height: number }
export interface CropWindow extends SourceDimensions { x: number; y: number }
export type FramingMode = 'dual' | 'center';
const evenFloor = (value: number): number => 2 * Math.floor(value / 2);
function validateDimensions({ width, height }: SourceDimensions): void {
  if (![width, height].every(n => Number.isSafeInteger(n) && n >= 2)) {
    throw new Error('Invalid source dimensions');
  }
}
export function selectFraming(source: SourceDimensions): FramingMode {
  validateDimensions(source);
  if (source.width <= source.height) return 'center';
  if (Math.floor(source.width / 2) < 480) return 'center';
  return 'dual';
}
// Position is a fraction of available travel. 0/1 anchor the left/right edges;
// y=0.25 keeps more headroom than centering (0.5), without pinning to the top.
export function panelWindow(source: SourceDimensions, x: number, y = 0.25): CropWindow {
  validateDimensions(source);
  if (![x, y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) {
    throw new Error('Invalid crop position');
  }
  let width = Math.floor(source.width / 2);
  let height = Math.round(width / 1.125);
  if (height > source.height) {
    height = source.height;
    width = Math.round(height * 1.125);
  }
  width = Math.max(2, evenFloor(width));
  height = Math.max(2, evenFloor(height));
  return { width, height, x: evenFloor((source.width - width) * x), y: evenFloor((source.height - height) * y) };
}
// Одиночный план — НЕ панель: у него соотношение сторон самого клипа (0,5625), а не 1,125.
// Берётся вся высота исходника и вертикальная полоса нужной ширины, поставленная по человеку.
export function singleWindow(source: SourceDimensions, x: number, y = 0.5): CropWindow {
  validateDimensions(source);
  if (![x, y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Invalid crop position');
  const { width: outW, height: outH } = FORMAT_DIMENSIONS.portrait;
  let height = source.height;
  let width = Math.round(height * (outW / outH));
  if (width > source.width) { width = source.width; height = Math.round(width * (outH / outW)); }
  width = Math.max(2, evenFloor(width));
  height = Math.max(2, evenFloor(height));
  return { width, height, x: evenFloor((source.width - width) * x), y: evenFloor((source.height - height) * y) };
}

export interface FramingPositions { mode: 'dual' | 'single' | 'center'; positions: { x: number; y: number }[] }

// Положения окон приходят СНАРУЖИ — их считает планировщик по найденным лицам.
// Без них остаётся прежнее поведение: деление пополам вслепую. Оно оставлено только как
// запасной путь, потому что измерено (23.09.2026), что вслепую нижняя панель пуста в 83 % клипа.
export function getFramingFilter(format: ClipFormat, source: SourceDimensions, plan?: FramingPositions): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const crop = (window: CropWindow, w: number, h: number) =>
    `crop=${window.width}:${window.height}:${window.x}:${window.y},scale=${w}:${h},setsar=1`;

  if (plan?.mode === 'single' && plan.positions[0]) {
    const p = plan.positions[0];
    return crop(singleWindow(source, p.x, p.y), width, height);
  }
  if (plan?.mode === 'center') return getScaleFilter(format);
  if (!plan && selectFraming(source) === 'center') return getScaleFilter(format);

  const top = plan?.positions[0] ?? { x: 0, y: 0.25 };
  const bottom = plan?.positions[1] ?? { x: 1, y: 0.25 };
  return `split=2[left][right];[left]${crop(panelWindow(source, top.x, top.y), width, height / 2)}[top];` +
    `[right]${crop(panelWindow(source, bottom.x, bottom.y), width, height / 2)}[bottom];` +
    `[top][bottom]vstack=inputs=2`;
}
export function getScaleFilter(format: ClipFormat): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}

/**
 * Подвижный вырез: окно переезжает за лицом (FR-3).
 *
 * `crop` в ffmpeg принимает ВЫРАЖЕНИЕ от времени, поэтому кусочная функция строится прямо в
 * фильтре и второго прохода не требует. Проверено настоящим ffmpeg 23.09.2026: на исходнике с
 * красной полосой слева и синим справа кадр на 1-й секунде красный, на 5-й синий.
 *
 * Запятые внутри выражения обязаны стоять в одинарных кавычках, иначе разбор графа примет их за
 * разделители фильтров — и это не теория, это то, как ffmpeg устроен.
 */
export function getFollowFilter(format: ClipFormat, source: SourceDimensions,
  segments: { from: number; x: number; y: number }[]): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  if (!segments.length) return getScaleFilter(format);
  const windows = segments.map(s => ({ from: s.from, w: singleWindow(source, s.x, s.y) }));
  const first = windows[0]!.w;
  // Одна позиция — обычный неподвижный вырез: выражение не нужно, а лишнее выражение это лишний риск.
  if (windows.length === 1) {
    return `crop=${first.width}:${first.height}:${first.x}:${first.y},scale=${width}:${height},setsar=1`;
  }
  // Вложенные условия от хвоста к голове: последний план — значение по умолчанию.
  const build = (pick: (w: CropWindow) => number) =>
    windows.slice(0, -1).reduceRight((acc, item, index) =>
      `if(lt(t\\,${windows[index + 1]!.from.toFixed(2)})\\,${pick(item.w)}\\,${acc})`,
      String(pick(windows[windows.length - 1]!.w)));
  return `crop=${first.width}:${first.height}:'${build(w => w.x)}':'${build(w => w.y)}',` +
    `scale=${width}:${height},setsar=1`;
}
