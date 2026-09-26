// ChunkDocument (Pseudocode, FR-INDEX-001, канон §7 «Поиск и ответ») — написано заново (ADR-016: донора нет).
// Страница → разделы по заголовкам h1–h3 → абзацы; абзац > 600 токенов → предложения; предложение > 600 →
// куски по словам ≤ 500 (слово длиннее — режется по символам). Соседние единицы раздела склеиваются до цели
// 500, не превышая 600; следующий фрагмент раздела начинается с последних ≈ 80 токенов предыдущего.
// context_path = «заголовок страницы › h1 › h2 › h3»; эмбеддинг считается от context_path + "\n" + текст.
// ЛИНЕЙНО по длине текста (урок ревью crawler BLOCKER-2): ни одного регэкспа с возвратом, каждый символ
// просматривается O(1) раз; страница до 2 млн символов — tests/chunk.test.ts «время».
import {
  CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, CONTEXT_HEADING_MAX_CHARS, CONTEXT_PATH_SEPARATOR,
} from './constants.js';

// Структурно совместимо с Block краулера (apps/worker/src/crawl/extract-text.ts): rag не зависит от воркера.
export interface ChunkBlock { kind: 'heading' | 'text'; level?: number; text: string }
export interface ChunkInput { title: string; blocks: readonly ChunkBlock[] }
export interface Chunk { ordinal: number; contextPath: string; text: string; tokenCount: number }

// Классы символов оценки: пробельные (0 токенов, разделяют серии), ASCII-буквы и цифры (≈ 4 символа на
// токен), кириллица (≈ 2 символа на токен), прочее — 1 токен на символ (пунктуация, эмодзи по половинкам
// суррогатной пары). Оценка намеренно СВЕРХУ: квота эмбеддингов списывается по ней ДО вызова, и
// недооценка оставила бы часть трат вне предела (model-call-cost п.4). Серии разных классов не сливаются,
// поэтому оценка текста, склеенного через пробел, РАВНА сумме оценок частей — на этом держится потолок.
const SPACE = 0, ASCII = 1, CYRILLIC = 2, OTHER = 3;
const PER_TOKEN = [0, 4, 2, 1];
export function isSpaceCode(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13) || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a)
    || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}
function charClass(code: number): number {
  if (isSpaceCode(code)) return SPACE;
  if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return ASCII;
  if (code >= 0x0400 && code <= 0x04ff) return CYRILLIC;
  return OTHER;
}
// Потоковый счётчик: после каждого добавленного символа total — точная оценка префикса.
class TokenCounter {
  total = 0;
  private cls = SPACE;
  private run = 0;
  add(code: number): void {
    const cls = charClass(code);
    if (cls === SPACE) { this.cls = SPACE; this.run = 0; return; }
    if (cls !== this.cls) { this.cls = cls; this.run = 0; }
    if (this.run % PER_TOKEN[cls]! === 0) this.total++;
    this.run++;
  }
}
export function estimateTokens(text: string): number {
  const counter = new TokenCounter();
  for (let i = 0; i < text.length; i++) counter.add(text.charCodeAt(i));
  return counter.total;
}

interface Unit { text: string; tokens: number; join: '\n' | ' ' }
const squash = (text: string) => text.replace(/\s+/g, ' ').trim(); // один класс с квантификатором — линейно
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

// Слово без пробелов длиннее предела — куски по символам (не разрывая суррогатную пару).
function hardSplit(word: string, limit: number): Unit[] {
  const pieces: Unit[] = [];
  let start = 0, counter = new TokenCounter();
  for (let i = 0; i < word.length; i++) {
    const before = counter.total;
    counter.add(word.charCodeAt(i));
    if (counter.total > limit && i > start) {
      const cut = isHighSurrogate(word.charCodeAt(i - 1)) && i - 1 > start ? i - 1 : i;
      pieces.push({ text: word.slice(start, cut), tokens: cut === i ? before : estimateTokens(word.slice(start, cut)), join: ' ' });
      start = cut; counter = new TokenCounter();
      for (let j = cut; j <= i; j++) counter.add(word.charCodeAt(j));
    }
  }
  if (start < word.length) pieces.push({ text: word.slice(start), tokens: counter.total, join: ' ' });
  return pieces;
}
// Предложение > потолка — куски по словам ≤ цели (чтобы перекрытие поместилось под потолок).
function wordPieces(sentence: string): Unit[] {
  const units: Unit[] = [];
  let words: string[] = [], tokens = 0;
  const flush = () => { if (words.length) units.push({ text: words.join(' '), tokens, join: ' ' }); words = []; tokens = 0; };
  for (const word of sentence.split(' ')) {
    if (!word) continue;
    const w = estimateTokens(word);
    if (w > CHUNK_TARGET_TOKENS) { flush(); units.push(...hardSplit(word, CHUNK_TARGET_TOKENS)); continue; }
    if (tokens + w > CHUNK_TARGET_TOKENS) flush();
    words.push(word); tokens += w;
  }
  flush();
  return units;
}
// Граница предложения — [.!?…] и пробел следом. Линейный проход без регэкспа.
function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c === 46 || c === 33 || c === 63 || c === 0x2026) && (i + 1 === text.length || text.charCodeAt(i + 1) === 32)) {
      out.push(text.slice(start, i + 1)); start = i + 2;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.length > 0);
}
function paragraphUnits(raw: string): Unit[] {
  const text = squash(raw);
  if (!text) return [];
  const tokens = estimateTokens(text);
  const units: Unit[] = [];
  if (tokens <= CHUNK_MAX_TOKENS) units.push({ text, tokens, join: ' ' });
  else for (const sentence of sentences(text)) {
    const t = estimateTokens(sentence);
    if (t <= CHUNK_MAX_TOKENS) units.push({ text: sentence, tokens: t, join: ' ' });
    else units.push(...wordPieces(sentence));
  }
  if (units.length) units[0]!.join = '\n';
  return units;
}
// Хвост текста не больше budget токенов, по границам слов. Идёт с конца: цена — длина хвоста плюс одно
// отвергнутое слово (оно не длиннее фрагмента) — линейно по сумме фрагментов.
function tail(text: string, budget: number): { text: string; tokens: number } {
  if (budget <= 0) return { text: '', tokens: 0 };
  let end = text.length, start = text.length, tokens = 0;
  while (end > 0) {
    while (end > 0 && isSpaceCode(text.charCodeAt(end - 1))) end--;
    let begin = end;
    while (begin > 0 && !isSpaceCode(text.charCodeAt(begin - 1))) begin--;
    if (begin === end) break;
    const w = estimateTokens(text.slice(begin, end));
    if (tokens + w > budget) break;
    tokens += w; start = begin; end = begin;
  }
  return { text: text.slice(start).trim(), tokens };
}
function clip(text: string): string {
  const head = squash(text.slice(0, CONTEXT_HEADING_MAX_CHARS * 4));
  const points = Array.from(head);
  return points.length > CONTEXT_HEADING_MAX_CHARS ? points.slice(0, CONTEXT_HEADING_MAX_CHARS).join('') + '…' : head;
}

export function chunkDocument(input: ChunkInput): Chunk[] {
  const title = clip(input.title ?? '');
  const chunks: Chunk[] = [];
  const stack: string[] = []; // h1..h3 текущего раздела
  let path = title;
  let units: Unit[] = [], tokens = 0, previous: string | null = null, head: { text: string; tokens: number } = { text: '', tokens: 0 };
  const flush = () => {
    if (!units.length) return;
    const parts: string[] = head.text ? [head.text] : [];
    units.forEach((u, i) => { if (i > 0 || head.text) parts.push(u.join); parts.push(u.text); });
    const text = parts.join('');
    const tokenCount = estimateTokens(text);
    // Не может случиться при верной упаковке; если случилось — дефект этого файла, а не «почти подходит».
    if (tokenCount < 1 || tokenCount > CHUNK_MAX_TOKENS) throw new Error(`ChunkDocument: фрагмент ${tokenCount} токенов вне 1–${CHUNK_MAX_TOKENS}`);
    chunks.push({ ordinal: chunks.length, contextPath: path, text, tokenCount });
    previous = text; units = []; tokens = 0; head = { text: '', tokens: 0 };
  };
  const section = () => { flush(); previous = null; }; // перекрытие не пересекает границу раздела
  const add = (unit: Unit) => {
    if (units.length) {
      const next = tokens + unit.tokens;
      // До цели — всегда; сверх цели (до потолка) — только если так фрагмент ближе к цели, чем без единицы.
      const fits = next <= CHUNK_TARGET_TOKENS || (next <= CHUNK_MAX_TOKENS && next - CHUNK_TARGET_TOKENS < CHUNK_TARGET_TOKENS - tokens);
      if (!fits) flush();
    }
    if (!units.length) {
      head = previous === null ? { text: '', tokens: 0 } : tail(previous, Math.min(CHUNK_OVERLAP_TOKENS, CHUNK_MAX_TOKENS - unit.tokens));
      tokens = head.tokens;
    }
    units.push(unit); tokens += unit.tokens;
  };
  for (const block of input.blocks) {
    if (typeof block?.text !== 'string') continue;
    const level = block.level ?? 0;
    if (block.kind === 'heading' && level >= 1 && level <= 3) {
      const heading = clip(block.text);
      if (!heading) continue;
      section();
      stack.length = level - 1;
      stack[level - 1] = heading;
      const names = [title, ...stack.filter(Boolean)].filter((name, i, all) => name && name !== all[i - 1]);
      path = names.join(CONTEXT_PATH_SEPARATOR);
      continue;
    }
    for (const unit of paragraphUnits(block.text)) add(unit);
  }
  flush();
  return chunks;
}

// Текст для эмбеддинга (FR-INDEX-001): «от 350 ₽» без заголовка «Доставка по России» не находится вопросом о доставке.
export const embeddingInput = (chunk: Pick<Chunk, 'contextPath' | 'text'>) => (chunk.contextPath ? `${chunk.contextPath}\n${chunk.text}` : chunk.text);

// Страница PDF — плоский текст: строка = абзац (extract-child.mjs ставит перевод строки по hasEOL).
export function plainTextBlocks(text: string): ChunkBlock[] {
  return text.split('\n').filter((line) => line.trim()).map((line) => ({ kind: 'text' as const, text: line }));
}
