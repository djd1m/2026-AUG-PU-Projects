// Adapted from jan-clone: only portrait; canon requires center crop, not padding.
export type ClipFormat = 'portrait';
export const FORMAT_DIMENSIONS = { portrait: { width: 1080, height: 1920 } } as const;
export function getScaleFilter(format: ClipFormat): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}
