export function rateToBasisPoints(raw: string, unit: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (unit === 'bp') {
    if (!/^\d+$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isInteger(value) && value >= 1 && value <= 10_000 ? value : null;
  }
  if (unit !== 'percent' || !/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return value >= 1 && value <= 10_000 ? value : null;
}
