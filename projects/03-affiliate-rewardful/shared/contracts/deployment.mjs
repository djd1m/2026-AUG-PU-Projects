// Explicit deployment identities. Never derive a credential destination from Host,
// query parameters, forwarded headers or a suffix match supplied by a caller.
const letters = ['A', 'B', 'C', 'D'];
const environments = [
  letters.map((_, i) => `http://127.0.0.1:${13031 + i}`),
  letters.map((_, i) => `http://localhost:${13031 + i}`),
  letters.map(letter => `https://n3-${letter.toLowerCase()}.212.192.0.33.sslip.io`),
];
export const originsFor = variant => environments.map(row => row[letters.indexOf(variant)]).filter(Boolean);
export const apiOrigins = new Set([...environments.flat(), 'http://127.0.0.1:13030', 'http://localhost:13030']);
export function variantOrigin(variant, currentOrigin) {
  const row = environments.find(values => values.includes(currentOrigin));
  const index = letters.indexOf(variant);
  if (!row || index < 0) throw new Error('Неизвестный адрес стенда. Откройте вариант из каталога демонстраций.');
  return row[index];
}
