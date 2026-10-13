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
import { setImmediate } from 'node:timers/promises';
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
interface Atom { readonly text: string; readonly sep: string; readonly solo?: boolean; readonly tokens: number }

const render = (atoms: readonly Atom[]): string => atoms.map((a, i) => (i === 0 ? a.text : a.sep + a.text)).join('');

/**
 * Символы — последний уровень: окна по ⌊limit/4⌋ кодовых точек. Токенов в окне не больше байт UTF-8 (≤ 4 на точку), значит
 * ≤ limit БЕЗ подсчёта: BPE на сплошной строке без пробелов квадратичен (5000 символов — десятки секунд), а такие строки
 * (base64, склеенные коды) — ровно то, что приходит со страниц. Окна не склеиваются с соседями (solo).
 */
function* byChars(text: string, limit: number): Generator<Atom> {
  const size = Math.max(1, Math.floor(limit / 4));
  let window = '';
  let points = 0;
  for (const cp of text) {
    window += cp;
    points += 1;
    if (points < size) continue;
    const tokens = countTokens(window);
    if (tokens > limit) throw new Error('предел меньше числа токенов одного символа Unicode');
    yield { text: window, sep: '', solo: true, tokens };
    window = '';
    points = 0;
  }
  if (window) yield { text: window, sep: '', solo: true, tokens: countTokens(window) };
}

const SEPARATORS = [/(?<=[.!?…])\s+/gu, /\s+/gu];
// Ни одна BPE-операция не получает целый большой документ/абзац. Разбор крупных единиц ленивый.
const BPE_WINDOW_CHARS = 4096;
function* explode(text: string, sep: string, limit: number, level = 0): Generator<Atom> {
  const longRun = new RegExp(`\\S{${Math.floor(limit / 4) + 1},}`, 'u');
  if (text.length <= BPE_WINDOW_CHARS && !longRun.test(text)) {
    const tokens = countTokens(text);
    if (tokens <= limit) { yield { text, sep, tokens }; return; }
  }
  const separator = SEPARATORS[level];
  if (!separator) { yield* byChars(text, limit); return; }
  let start = 0;
  let first = true;
  for (const match of text.matchAll(separator)) {
    const piece = text.slice(start, match.index);
    if (piece) {
      yield* explode(piece, first ? sep : ' ', limit, level + 1);
      first = false;
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) yield* explode(text.slice(start), first ? sep : ' ', limit, level + 1);
}

/**
 * Хвост части для перекрытия ≤ overlap токенов: целые единицы с конца; единицу, которая целиком не влезает, дробим на
 * предложения/слова и берём её конец. Хвост, равный всей части, не берётся (перекрытие повторило бы её целиком).
 */
function overlapTail(cur: readonly Atom[], overlap: number): Atom[] {
  if (overlap === 0) return [];
  let tail: Atom[] = [];
  for (let i = cur.length - 1; i >= 0; i -= 1) {
    const next = [cur[i]!, ...tail];
    if (countTokens(render(next)) <= overlap) { tail = next; continue; }
    const pieces = [...explode(cur[i]!.text, cur[i]!.sep, overlap)];
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
function* chunkSteps(text: string, target: number, overlap: number): Generator<TextPart | undefined> {
  if (typeof text !== 'string') throw new Error('текст документа не строка: нарезка невозможна');
  if (!Number.isSafeInteger(target) || target < 1 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= target) {
    throw new Error('параметры нарезки непригодны: нужно 0 ≤ перекрытие < предел');
  }
  const seen = new Set<string>();
  let ord = 0;
  const part = (atoms: readonly Atom[]): TextPart | undefined => {
    const text = render(atoms);
    const tokens = atoms.length === 1 ? atoms[0]!.tokens : countTokens(text);
    const hash = sha256(text);
    if (seen.has(hash)) return undefined;
    seen.add(hash);
    return { ord: ord++, text, tokens, sha256: hash };
  };
  let cur: Atom[] = [];
  let estimate = 0;
  let chars = 0;
  const estimated = (atoms: readonly Atom[]) => atoms.reduce((n, a, i) => n + a.tokens + (i ? countTokens(a.sep) : 0), 0);
  // Сумма — только триггер точной проверки, не доказательство верхней границы BPE.
  // При переполнении точным поиском выбираем целый префикс и сохраняем ВСЕ оставшиеся единицы.
  function* drain(final: boolean): Generator<TextPart | undefined> {
    while (cur.length && (final || estimate > target || chars > BPE_WINDOW_CHARS)) {
      const exact = countTokens(render(cur));
      if (exact <= target && chars <= BPE_WINDOW_CHARS) {
        estimate = exact;
        if (final) { yield part(cur); cur = []; chars = 0; }
        break;
      }
      let lo = 1;
      let hi = cur.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = render(cur.slice(0, mid));
        if (candidate.length <= BPE_WINDOW_CHARS && countTokens(candidate) <= target) lo = mid;
        else hi = mid - 1;
      }
      const prefix = cur.slice(0, lo);
      yield part(prefix);
      const rest = cur.slice(lo);
      const tail = overlapTail(prefix, overlap);
      // Перекрытие не должно вытеснять большую следующую единицу (F-3).
      cur = countTokens(render([...tail, rest[0]!])) > target ? rest : [...tail, ...rest];
      estimate = estimated(cur);
      chars = render(cur).length;
    }
  }
  for (const line of text.matchAll(/[^\r\n]+/gu)) {
    const paragraph = line[0].replace(/\u0000/g, '').trim();
    if (!paragraph) continue;
    for (const atom of explode(paragraph, '\n', target)) {
      if (atom.solo) {
        yield* drain(true);
        yield part([atom]);
        estimate = 0;
      } else {
        chars += atom.text.length + (cur.length ? atom.sep.length : 0);
        estimate += atom.tokens + (cur.length ? countTokens(atom.sep) : 0);
        cur.push(atom);
        yield* drain(false);
      }
      yield undefined; // контрольная граница даже внутри одного длинного абзаца
    }
  }
  yield* drain(true);
}

export function splitIntoChunks(text: string, target = CHUNK_TARGET_TOKENS, overlap = CHUNK_OVERLAP_TOKENS): TextPart[] {
  return [...chunkSteps(text, target, overlap)].filter((p): p is TextPart => p !== undefined);
}

/** Тот же детерминированный алгоритм; уступаем цикл событий и проверяем аренду в пределах документа. */
export async function splitIntoChunksAsync(text: string, checkpoint: () => Promise<void>,
  target = CHUNK_TARGET_TOKENS, overlap = CHUNK_OVERLAP_TOKENS): Promise<TextPart[]> {
  const parts: TextPart[] = [];
  let deadline = performance.now() + 10;
  for (const p of chunkSteps(text, target, overlap)) {
    if (p) parts.push(p);
    if (performance.now() < deadline) continue;
    await setImmediate();
    await checkpoint();
    deadline = performance.now() + 10;
  }
  await setImmediate();
  await checkpoint();
  return parts;
}
