// `NormalizeRuName` — ОДНА функция на импорт seed'а курации и на поиск (FR-source-and-
// correct-3, AC-source-and-correct-3). Ручная нормализация в файле seed запрещена: два
// места с одним правилом расходятся молча (`02_pseudocode.md`, `SeedFoodSynonyms` шаг 1.4).
//
// `\w` в кириллице НЕ совпадает и вырезал бы русское название целиком — известная грабля
// стека (`coding-style.md`, «Известные грабли»). Используется `\p{L}`/`\p{N}` с флагом `/u`.

const STOP_WORDS = new Set(['с', 'из', 'по', 'на', 'и', 'в', 'для']);

/** Всё, что НЕ буква и не цифра юникода — заменяется пробелом. */
const NON_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/gu;

export function normalizeRuName(input: string): string {
  const lower = input.toLowerCase().replace(/ё/g, 'е');
  const cleaned = lower.replace(NON_LETTER_OR_DIGIT, ' ');
  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
  return tokens.join(' ');
}
