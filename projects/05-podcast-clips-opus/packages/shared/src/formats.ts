// Closed set of output formats, shared by rendering and startup validation.
export const FORMAT_DIMENSIONS = { portrait: { width: 1080, height: 1920 } } as const;
export type ClipFormat = keyof typeof FORMAT_DIMENSIONS;
