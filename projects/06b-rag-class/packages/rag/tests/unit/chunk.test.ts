import { describe, expect, it } from 'vitest';
import { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, countTokens, sha256, splitIntoChunks } from '../../src/chunk';

// Нарезка (Pseudocode «Chunk and embed» шаги 1–2, FR-n6b-4): ≤ 500 токенов cl100k_base, перекрытие ≤ 80, по абзацам.

const RU = 'Доставка по Москве занимает один-два рабочих дня, по России — от трёх до семи. '
  + 'Возврат товара возможен в течение четырнадцати дней при сохранении упаковки и чека. ';
const EN = 'Shipping within the city takes one to two business days, nationwide from three to seven. '
  + 'Returns are accepted within fourteen days if the packaging and receipt are kept. ';

const paragraphs = (unit: string, n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. ${unit}`).join('\n');

describe('countTokens (js-tiktoken cl100k_base)', () => {
  it('считает токены, а не символы: пустая строка — 0, русский текст дороже английского той же длины', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens('hello world')).toBe(2);
    expect(countTokens(RU)).toBeGreaterThan(countTokens(EN));
  });
});

describe('splitIntoChunks', () => {
  it('пустой и пробельный текст → ни одной части (нечего эмбеддить и оплачивать)', () => {
    expect(splitIntoChunks('')).toEqual([]);
    expect(splitIntoChunks(' \n\n \r\n\t')).toEqual([]);
  });

  for (const [lang, unit] of [['русский', RU], ['английский', EN]] as const) {
    it(`${lang}: каждая часть ≤ ${CHUNK_TARGET_TOKENS} токенов, tokens и sha256 точные, весь текст покрыт`, () => {
      const text = paragraphs(unit, 60);
      const parts = splitIntoChunks(text);
      expect(parts.length).toBeGreaterThan(3);
      for (const p of parts) {
        expect(p.tokens).toBe(countTokens(p.text));
        expect(p.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS);
        expect(p.tokens).toBeGreaterThan(CHUNK_TARGET_TOKENS / 2); // части не дробятся зря
        expect(p.sha256).toBe(sha256(p.text));
      }
      expect(parts.map((p) => p.ord)).toEqual(parts.map((_, i) => i));
      for (let i = 1; i <= 60; i += 1) expect(parts.some((p) => p.text.includes(`${i}. `)), `абзац ${i}`).toBe(true);
    });
  }

  it('перекрытие: следующая часть начинается с хвоста предыдущей, хвост 1…80 токенов', () => {
    for (const unit of [RU, EN]) {
      const parts = splitIntoChunks(paragraphs(unit, 40));
      expect(parts.length).toBeGreaterThan(2);
      for (let i = 1; i < parts.length; i += 1) {
        const prev = parts[i - 1]!.text;
        const next = parts[i]!.text;
        let shared = '';
        for (let len = Math.min(prev.length, next.length); len > 0; len -= 1) {
          if (next.startsWith(prev.slice(prev.length - len))) { shared = prev.slice(prev.length - len); break; }
        }
        expect(shared.length, `часть ${i}`).toBeGreaterThan(10);
        expect(countTokens(shared)).toBeLessThanOrEqual(CHUNK_OVERLAP_TOKENS);
      }
    }
  });

  it('граница: текст ровно 500 токенов — одна часть; 501 токен — две', () => {
    const exact = (n: number) => `start${' a'.repeat(n - 1)}`; // «start» и каждое « a» — по одному токену
    const t500 = exact(500);
    const t501 = exact(501);
    expect(countTokens(t500)).toBe(500);
    expect(countTokens(t501)).toBe(501);
    expect(splitIntoChunks(t500)).toHaveLength(1);
    const two = splitIntoChunks(t501);
    expect(two.length).toBe(2);
    for (const p of two) expect(p.tokens).toBeLessThanOrEqual(500);
  });

  it('абзац без переносов режется по предложениям; сплошная строка 20 000 символов — окнами, быстро', () => {
    const long = splitIntoChunks(Array.from({ length: 40 }, (_, i) => `Пункт ${i}. ${RU}`).join('')); // без переносов
    expect(long.length).toBeGreaterThan(5);
    for (const p of long) expect(p.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS);
    let seed = 7; // сплошная строка без пробелов (base64, склейка): неповторяющиеся буквы, чтобы части не схлопнулись
    const letters = 'абвгдежзиклмнопрстуфхцчшщыэюя';
    const blob = Array.from({ length: 20_000 }, () => letters[(seed = (seed * 48271) % 2147483647) % 29]).join('');
    const started = Date.now();
    const pieces = splitIntoChunks(`Начало. ${blob} Конец.`);
    expect(Date.now() - started).toBeLessThan(5000); // BPE на сплошной строке квадратичен — окна его обходят
    expect(pieces.length).toBeGreaterThan(20);
    for (const p of pieces) expect(p.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS);
    expect(pieces.map((p) => p.text).join('')).toContain(blob.slice(0, 125));
    expect(pieces.every((p) => !p.text.includes('\uFFFD'))).toBe(true); // кириллица не рвётся посреди байтов
  });

  it('SC-US-017-2: тот же текст — те же хэши (кэш работает); изменённый абзац меняет только свою часть', () => {
    const text = paragraphs(EN, 60);
    const a = splitIntoChunks(text).map((p) => p.sha256);
    expect(splitIntoChunks(text).map((p) => p.sha256)).toEqual(a);
    const changed = text.replace('55. Shipping', '55. Delivery');
    const b = splitIntoChunks(changed).map((p) => p.sha256);
    const unchanged = b.filter((h) => a.includes(h)).length;
    expect(b.length - unchanged).toBeGreaterThanOrEqual(1);
    expect(b.length - unchanged).toBeLessThanOrEqual(2); // часть с абзацем и, возможно, соседняя по перекрытию
    expect(unchanged).toBeGreaterThan(b.length / 2);
  });

  it('повторяющиеся абзацы внутри документа схлопываются: хэши уникальны (unique(document_id, text_sha256))', () => {
    const parts = splitIntoChunks(Array.from({ length: 30 }, () => EN.repeat(12)).join('\n'));
    expect(new Set(parts.map((p) => p.sha256)).size).toBe(parts.length);
  });

  it('NUL удаляется (Postgres text его не хранит), параметры нарезки проверяются', () => {
    expect(splitIntoChunks('a\u0000b')[0]!.text).toBe('ab');
    expect(() => splitIntoChunks('x', 100, 100)).toThrow(/перекрытие/);
    expect(() => splitIntoChunks(42 as unknown as string)).toThrow(/не строка/);
  });
});
