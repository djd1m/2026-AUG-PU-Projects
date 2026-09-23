export const CLIP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// New links default to six; ten remains a supported generation setting.
export function clipCodeLength(value: string | undefined): 6 | 10 {
  if (value === undefined || value === '6') return 6;
  if (value === '10') return 10;
  throw new Error('N5_SHORT_CODE_LENGTH: expected 6 or 10');
}
