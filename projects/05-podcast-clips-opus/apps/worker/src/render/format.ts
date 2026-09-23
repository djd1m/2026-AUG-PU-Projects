// Adapted from jan-clone: only portrait; canon requires center crop, not padding.
import { FORMAT_DIMENSIONS, type ClipFormat } from '@clipmaker/shared/formats';
export { FORMAT_DIMENSIONS, type ClipFormat } from '@clipmaker/shared/formats';
export function getScaleFilter(format: ClipFormat): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}
