/** Russian noun forms for integer counts: one, few, many. */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const count = Math.abs(n), last = count % 10, hundred = count % 100;
  if (last === 1 && hundred !== 11) return forms[0];
  if (last >= 2 && last <= 4 && (hundred < 12 || hundred > 14)) return forms[1];
  return forms[2];
}
