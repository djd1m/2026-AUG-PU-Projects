// Explicit deployment identities. Never derive a credential destination from Host,
// query parameters, forwarded headers or a suffix match supplied by a caller.
// Each row is one complete deployment environment: A, B, C, D in that order.
const letters = ['A', 'B', 'C', 'D'];
const environments = [
  letters.map((_, i) => `http://127.0.0.1:${13031 + i}`),
  letters.map((_, i) => `http://localhost:${13031 + i}`),
  // Public domain (owner decision 2026-09-29): the bare domain is A and hosts the demo catalog.
  ['https://reward.aicoding.space', 'https://b.reward.aicoding.space', 'https://c.reward.aicoding.space', 'https://d.reward.aicoding.space'],
  // The same variants under explicit per-letter subdomains; A here is an alias of the bare domain.
  letters.map(letter => `https://${letter.toLowerCase()}.reward.aicoding.space`),
  // Fallback address of the current server (the former 212.192.0.33 server no longer exists).
  letters.map(letter => `https://n3-${letter.toLowerCase()}.194.85.249.105.sslip.io`),
];
export const originsFor = variant => [...new Set(environments.map(row => row[letters.indexOf(variant)]).filter(Boolean))];
export const apiOrigins = new Set([...environments.flat(), 'http://127.0.0.1:13030', 'http://localhost:13030']);
export function variantOrigin(variant, currentOrigin) {
  const row = environments.find(values => values.includes(currentOrigin));
  const index = letters.indexOf(variant);
  if (!row || index < 0) throw new Error('Неизвестный адрес стенда. Откройте вариант из каталога демонстраций.');
  return row[index];
}
