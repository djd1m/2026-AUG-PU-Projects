// Нарезка текста документа (Pseudocode «Chunk and embed» шаги 1–2; Architecture «Tokens»: js-tiktoken, cl100k_base).
// Писалось с нуля (reuse-inventory: нарезки в N1–N5 нет).
//
// Части ≤ CHUNK_TARGET_TOKENS токенов по границам абзацев (абзац = строка: обходчик соединяет блоки переводом строки).
// Абзац длиннее предела режется на предложения, предложение — на слова, слово — на символы: каждая единица ≤ предела,
// поэтому часть не превышает его НИКОГДА (граница проверяется точным подсчётом собранного текста, а не суммой оценок).
// Перекрытие: новая часть начинается с хвоста предыдущей — целыми единицами суммарно ≤ CHUNK_OVERLAP_TOKENS.
// text_sha256 — хэш НЕИЗМЕНЁННОГО текста части: ключ кэша эмбеддингов (unique(document_id, text_sha256)); одинаковые
// части внутри документа схлопываются в одну (иначе второй INSERT упёрся бы в уникальный ключ).

import { createHash } from 'node:crypto';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k from 'js-tiktoken/ranks/cl100k_base';

export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 80;

let encoder: Tiktoken | undefined;
const enc = (): Tiktoken => (encoder ??= new Tiktoken(cl100k));

/** Точное число токенов cl100k_base (та же токенизация, что у text-embedding-3-small). */
export function countTokens(text: string): number {
  return text === '' ? 0 : enc().encode(text).length;
}

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export interface TextPart {
  readonly ord: number;
  readonly text: string;
  readonly tokens: number;
  readonly sha256: string;
}

/** Единица сборки: текст и разделитель ПЕРЕД ним, если единица не первая в части. */
interface Atom { readonly text: string; readonly sep: string; readonly solo?: boolean }

const render = (atoms: readonly Atom[]): string => atoms.map((a, i) => (i === 0 ? a.text : a.sep + a.text)).join('');

/**
 * Символы — последний уровень: окна по ⌊limit/4⌋ кодовых точек. Токенов в окне не больше байт UTF-8 (≤ 4 на точку), значит
 * ≤ limit БЕЗ подсчёта: BPE на сплошной строке без пробелов квадратичен (5000 символов — десятки секунд), а такие строки
 * (base64, склеенные коды) — ровно то, что приходит со страниц. Окна не склеиваются с соседями (solo).
 */
function byChars(text: string, limit: number): string[] {
  const cps = Array.from(text);
  const size = Math.max(1, Math.floor(limit / 4));
  const out: string[] = [];
  for (let i = 0; i < cps.length; i += size) out.push(cps.slice(i, i + size).join(''));
  return out;
}

const LEVELS: ReadonlyArray<{ split: (s: string) => string[]; sep: string }> = [
  { split: (s) => s.split(/(?<=[.!?…])\s+/u), sep: ' ' }, // предложения
  { split: (s) => s.split(/\s+/u), sep: ' ' }, // слова
];

/** Единица ≤ limit как есть; иначе — следующий уровень дробления. Первый кусок наследует разделитель единицы. */
function explode(text: string, sep: string, limit: number, level = 0): Atom[] {
  const longRun = new RegExp(`\\S{${Math.floor(limit / 4) + 1},}`, 'u');
  if (!longRun.test(text) && countTokens(text) <= limit) return [{ text, sep }];
  const lvl = LEVELS[level];
  if (!lvl) return byChars(text, limit).map((p, i) => ({ text: p, sep: i === 0 ? sep : '', solo: true }));
  const pieces = lvl.split(text).filter((p) => p !== '');
  if (pieces.length <= 1) return explode(text, sep, limit, level + 1);
  return pieces.flatMap((p, i) => explode(p, i === 0 ? sep : lvl.sep, limit, level + 1));
}

/**
 * Хвост части для перекрытия ≤ overlap токенов: целые единицы с конца; единицу, которая целиком не влезает, дробим на
 * предложения/слова и берём её конец. Хвост, равный всей части, не берётся (перекрытие повторило бы её целиком).
 */
function overlapTail(cur: readonly Atom[], overlap: number): Atom[] {
  let tail: Atom[] = [];
  for (let i = cur.length - 1; i >= 0; i -= 1) {
    const next = [cur[i]!, ...tail];
    if (countTokens(render(next)) <= overlap) { tail = next; continue; }
    const pieces = explode(cur[i]!.text, cur[i]!.sep, overlap);
    for (let j = pieces.length - 1; j >= 0; j -= 1) {
      const more = [pieces[j]!, ...tail];
      if (countTokens(render(more)) > overlap) break;
      tail = more;
    }
    break;
  }
  return tail.length === cur.length && tail.every((a, i) => a === cur[i]) ? [] : tail;
}

/**
 * Текст документа → части ≤ target токенов с перекрытием ≤ overlap. Пустой текст — пустой список. NUL удаляется
 * (Postgres text его не хранит); прочие символы не трогаются — хэш считается от того, что уйдёт в эмбеддинг.
 */
export function splitIntoChunks(text: string, target = CHUNK_TARGET_TOKENS, overlap = CHUNK_OVERLAP_TOKENS): TextPart[] {
  if (typeof text !== 'string') throw new Error('текст документа не строка: нарезка невозможна');
  if (!Number.isSafeInteger(target) || target < 1 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= target) {
    throw new Error('параметры нарезки непригодны: нужно 0 ≤ перекрытие < предел');
  }
  const paragraphs = text.replace(/\u0000/g, '').split(/\r?\n/).map((p) => p.trim()).filter((p) => p !== '');
  const atoms = paragraphs.flatMap((p) => explode(p, '\n', target));

  const rendered: string[] = [];
  let cur: Atom[] = [];
  for (const atom of atoms) {
    if (atom.solo) { // окно сплошной строки — своя часть, без склейки и перекрытия (см. byChars)
      if (cur.length > 0) rendered.push(render(cur));
      rendered.push(atom.text);
      cur = [];
      continue;
    }
    if (cur.length === 0) { cur = [atom]; continue; }
    const candidate = [...cur, atom];
    if (countTokens(render(candidate)) <= target) { cur = candidate; continue; }
    rendered.push(render(cur));
    const tail = overlapTail(cur, overlap);
    cur = [...tail, atom];
    if (countTokens(render(cur)) > target) cur = [atom];
  }
  if (cur.length > 0) rendered.push(render(cur));

  const seen = new Set<string>();
  const parts: TextPart[] = [];
  for (const partText of rendered) {
    const hash = sha256(partText);
    if (seen.has(hash)) continue;
    seen.add(hash);
    parts.push({ ord: parts.length, text: partText, tokens: countTokens(partText), sha256: hash });
  }
  return parts;
}
