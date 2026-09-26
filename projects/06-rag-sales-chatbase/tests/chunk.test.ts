// ChunkDocument (FR-INDEX-001, канон §7: цель 500 / потолок 600 / перекрытие 80, context_path) и оценка
// токенов. Время — на 2 млн символов враждебных форм (урок ревью crawler BLOCKER-2: линейность проверяется
// временем, а не чтением кода).
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { chunkDocument, embeddingInput, estimateTokens, plainTextBlocks, type Chunk, type ChunkBlock } from '../packages/rag/src/chunk';
import { CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS } from '../packages/rag/src/constants';

const para = (i: number, words = 40) => Array.from({ length: words }, (_, k) => `слово${i}_${k}`).join(' ') + '.';
const text = (t: string): ChunkBlock => ({ kind: 'text', text: t });
const h = (level: number, t: string): ChunkBlock => ({ kind: 'heading', level, text: t });
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function assertInvariants(chunks: Chunk[]) {
  chunks.forEach((c, i) => {
    expect(c.ordinal).toBe(i);
    expect(c.text.length).toBeGreaterThan(0);
    expect(c.tokenCount).toBe(estimateTokens(c.text));
    expect(c.tokenCount).toBeGreaterThanOrEqual(1);
    expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_MAX_TOKENS);
  });
}

describe('Оценка токенов', () => {
  it.each([
    ['', 0], ['   \n\t', 0], ['hello', 2], ['abcd', 1], ['привет', 3], ['при', 2], ['!!!', 3], ['a b', 2], ['350 ₽', 2], ['Цена500', 3], ['😀', 2],
  ])('%j → %i', (value, expected) => expect(estimateTokens(value)).toBe(expected));
  it('оценка текста через пробел равна сумме оценок частей (на этом держится потолок)', () => {
    const parts = ['Доставка', 'по', 'России', 'от', '350', '₽.', 'hello,world', '—', 'ёжик42'];
    expect(estimateTokens(parts.join(' '))).toBe(parts.reduce((n, p) => n + estimateTokens(p), 0));
    expect(estimateTokens(parts.join('\n'))).toBe(estimateTokens(parts.join(' ')));
  });
});

describe('ChunkDocument', () => {
  it('контекст: «заголовок страницы › h2», эмбеддинг от контекста + текста (FR-INDEX-001: «от 350 ₽»)', () => {
    const chunks = chunkDocument({ title: 'Магазин цветов', blocks: [h(1, 'Магазин цветов'), text('Мы продаём цветы.'), h(2, 'Доставка по России'), text('от 350 ₽')] });
    expect(chunks.map((c) => c.contextPath)).toEqual(['Магазин цветов', 'Магазин цветов › Доставка по России']);
    expect(chunks[1]!.text).toBe('от 350 ₽');
    expect(embeddingInput(chunks[1]!)).toBe('Магазин цветов › Доставка по России\nот 350 ₽');
  });
  it('цепочка заголовков: h3 под h2, новый h2 сбрасывает h3; h4 — текст раздела', () => {
    const chunks = chunkDocument({ title: 'Сайт', blocks: [h(2, 'Цены'), h(3, 'Опт'), text('опт текст'), h(4, 'Мелкий'), text('ещё'), h(2, 'Контакты'), text('телефон')] });
    expect(chunks.map((c) => [c.contextPath, c.text])).toEqual([['Сайт › Цены › Опт', 'опт текст\nМелкий\nещё'], ['Сайт › Контакты', 'телефон']]);
  });
  it('цель 500 / потолок 600 / перекрытие ≈ 80 внутри раздела; каждое слово попадает во фрагмент', () => {
    const blocks = Array.from({ length: 60 }, (_, i) => text(para(i)));
    const chunks = chunkDocument({ title: 'Статья', blocks });
    assertInvariants(chunks);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks.slice(0, -1)) expect(c.tokenCount).toBeGreaterThan(CHUNK_TARGET_TOKENS * 0.7);
    for (let i = 1; i < chunks.length; i++) {
      const prevWords = chunks[i - 1]!.text.split(/\s+/), words = chunks[i]!.text.split(/\s+/);
      // Перекрытие — хвост предыдущего фрагмента: первые слова совпадают с его последними словами.
      const tailStart = prevWords.indexOf(words[0]!);
      expect(tailStart).toBeGreaterThan(0);
      const tail = prevWords.slice(tailStart);
      expect(words.slice(0, tail.length)).toEqual(tail);
      const tokens = estimateTokens(tail.join(' '));
      expect(tokens).toBeGreaterThan(CHUNK_OVERLAP_TOKENS / 2);
      expect(tokens).toBeLessThanOrEqual(CHUNK_OVERLAP_TOKENS);
    }
    const all = chunks.map((c) => c.text).join(' ');
    for (let i = 0; i < 60; i++) expect(all).toContain(`слово${i}_39.`);
  });
  it('перекрытие не пересекает границу раздела', () => {
    const blocks = [h(2, 'А'), ...Array.from({ length: 20 }, (_, i) => text(para(i))), h(2, 'Б'), text('первый абзац раздела Б')];
    const chunks = chunkDocument({ title: 'T', blocks });
    const b = chunks.find((c) => c.contextPath === 'T › Б')!;
    expect(b.text).toBe('первый абзац раздела Б');
  });
  it('абзац > 600 → предложения; предложение > 600 → слова; слово без пробелов → куски; суррогаты не разрываются', () => {
    const longParagraph = Array.from({ length: 80 }, (_, i) => `Предложение номер ${i} о доставке и оплате товара.`).join(' ');
    const longSentence = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const longWord = 'я'.repeat(5000);
    const emoji = '😀'.repeat(3000);
    const chunks = chunkDocument({ title: 'T', blocks: [text(longParagraph), text(longSentence), text(longWord), text(emoji)] });
    assertInvariants(chunks);
    expect(chunks.some((c) => c.text.startsWith('Предложение') || c.text.includes('Предложение номер 1 '))).toBe(true);
    expect(chunks.every((c) => !LONE_SURROGATE.test(c.text))).toBe(true);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('w1999');
    expect(joined.replace(/[^я]/g, '').length).toBeGreaterThanOrEqual(5000);
  });
  it('пустые блоки и заголовки без текста — ноль фрагментов; непригодный блок пропускается', () => {
    expect(chunkDocument({ title: 'T', blocks: [h(2, 'Пусто'), text('   ')] })).toEqual([]);
    expect(chunkDocument({ title: 'T', blocks: [{ kind: 'text', text: 42 as unknown as string }, text('ok')] }).map((c) => c.text)).toEqual(['ok']);
  });
  it('заголовок в пути обрезается до 120 символов', () => {
    const [c] = chunkDocument({ title: 'Т'.repeat(10_000), blocks: [text('x')] });
    expect(Array.from(c!.contextPath).length).toBe(121);
  });
  it('PDF: строка — абзац', () => {
    expect(plainTextBlocks('Прайс\n\nДоставка 350 ₽\n  \nГарантия')).toEqual([text('Прайс'), text('Доставка 350 ₽'), text('Гарантия')]);
  });
});

describe('Время ChunkDocument на 2 млн символов (линейность)', () => {
  const N = 2_000_000;
  const shapes: Array<[string, () => ChunkBlock[]]> = [
    ['русский текст абзацами с заголовками', () => {
      const blocks: ChunkBlock[] = []; let size = 0, i = 0;
      while (size < N) { const b = i % 10 === 0 ? h(2 + (i % 2), `Раздел ${i}`) : text(`Абзац ${i}: цены, доставка и гарантия магазина. `.repeat(8)); blocks.push(b); size += b.text.length; i++; }
      return blocks;
    }],
    ['одно слово без пробелов', () => [text('а'.repeat(N))]],
    ['один абзац слов без точек', () => [text('слово '.repeat(N / 6))]],
    ['один абзац из крошечных предложений', () => [text('а. '.repeat(N / 3))]],
    ['точки без пробелов', () => [text('.'.repeat(N))]],
    ['100 000 заголовков', () => Array.from({ length: 100_000 }, (_, i) => (i % 2 ? text('x'.repeat(19)) : h(2, `З${i}`)))],
    ['PDF: 2 млн символов строками', () => plainTextBlocks('строка прайса 350 ₽\n'.repeat(N / 20))],
    ['эмодзи без пробелов', () => [text('😀'.repeat(N / 2))]],
  ];
  it.each(shapes)('%s — < 3 с, инварианты фрагментов соблюдены', (_name, make) => {
    const blocks = make();
    const started = performance.now();
    const chunks = chunkDocument({ title: 'Страница', blocks });
    const ms = performance.now() - started;
    expect(ms).toBeLessThan(3000);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.tokenCount >= 1 && c.tokenCount <= CHUNK_MAX_TOKENS)).toBe(true);
    console.log(`chunk-time ${_name}: ${Math.round(ms)} мс, фрагментов ${chunks.length}`);
  }, 30_000);
});
