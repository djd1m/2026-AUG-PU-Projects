// Канон §7. Размеры частей — политика транспорта из январского донора.
export const MAX_UPLOAD_BYTES = 2_000_000_000;
export const PRESIGNED_SECONDS = 900;
export function moscowDay(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Непригодное время');
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function quotaResetAt(now: Date): string {
  return new Date(Date.parse(`${moscowDay(now)}T21:00:00Z`)).toISOString();
}
