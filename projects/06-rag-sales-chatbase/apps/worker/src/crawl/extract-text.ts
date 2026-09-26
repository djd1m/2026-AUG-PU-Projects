// Извлечение основного текста и заголовков из HTML (FR-SOURCE-001, CrawlSite п.3) — написано заново
// (ADR-016). Architecture называл linkedom; взят собственный однопроходный разборщик тегов без DOM:
// задача — текст, заголовки и ссылки, а не дерево; ноль зависимостей и ноль исполнения скриптов.
// «Readability-подобно»: навигация, подвал, формы, скрипты и стили выбрасываются; если есть <main> или
// <article> с достаточным текстом — берётся только он.
import { createHash } from 'node:crypto';
import { CRAWL_MIN_TEXT_CHARS } from './limits';

export interface Block { kind: 'heading' | 'text'; level?: 1 | 2 | 3 | 4 | 5 | 6; text: string }
export interface ExtractedPage {
  title: string; headings: Array<{ level: number; text: string }>; blocks: Block[]; text: string;
  // href как в разметке; разрешает относительно base (или адреса страницы) вызывающий.
  links: string[]; base: string | null; noindex: boolean; nofollow: boolean;
}

// Содержимое выбрасывается целиком. Сырой текст (script/style/…) пропускается до закрывающего тега.
const RAW = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'xmp']);
const SKIP = new Set(['svg', 'math', 'iframe', 'object', 'canvas', 'nav', 'footer', 'aside', 'form', 'select', 'button', 'dialog', 'menu']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'tr', 'td', 'th', 'table',
  'blockquote', 'pre', 'br', 'hr', 'figure', 'figcaption', 'address', 'details', 'summary', 'header', 'body']);
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  hellip: '…', copy: '©', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bdquo: '„',
  bull: '•', middot: '·', deg: '°', times: '×', minus: '−', shy: '', euro: '€', rub: '₽', numero: '№',
};
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}
const squash = (text: string) => decodeEntities(text).replace(/\s+/g, ' ').trim();

function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

const CLOSERS = new Map<string, RegExp>();
const closerFor = (name: string) => {
  let re = CLOSERS.get(name);
  if (!re) { re = new RegExp(`</${name}`, 'gi'); CLOSERS.set(name, re); }
  return re;
};

// Разбор тегов — ручной сканер, а не один большой регэксп (ревью crawler, BLOCKER-2 и найденное при его
// правке): регэксп тега на незакрытом «<a '…» пробовал каждую позицию до конца документа — O(n²) на
// 2 МБ чужой страницы блокировал весь воркер. Здесь каждая ветка продвигает позицию, а поиск конца,
// не нашедший его, случается только у конца документа (остаток отбрасывается, как в HTML) — O(n).
const NAME = /[a-zA-Z][a-zA-Z0-9:-]*/y;
type Token =
  | { kind: 'text'; text: string; next: number }
  | { kind: 'tag'; closing: boolean; name: string; attrs: string; next: number }
  | { kind: 'skip'; next: number };
function nextToken(html: string, i: number): Token {
  if (html.charCodeAt(i) !== 60 /* < */) {
    const lt = html.indexOf('<', i);
    const end = lt < 0 ? html.length : lt;
    return { kind: 'text', text: html.slice(i, end), next: end };
  }
  const until = (marker: string, from: number) => { const e = html.indexOf(marker, from); return e < 0 ? html.length : e + marker.length; };
  if (html.startsWith('<!--', i)) return { kind: 'skip', next: until('-->', i + 4) };
  if (html.startsWith('<![CDATA[', i)) return { kind: 'skip', next: until(']]>', i + 9) };
  if (html[i + 1] === '!' || html[i + 1] === '?') return { kind: 'skip', next: until('>', i + 2) };
  const closing = html[i + 1] === '/';
  NAME.lastIndex = i + (closing ? 2 : 1);
  const name = NAME.exec(html);
  if (!name) return { kind: 'text', text: '<', next: i + 1 };
  const start = NAME.lastIndex;
  // Конец тега — «>» вне кавычек; кавычка открывает значение только сразу после «=» (как в HTML).
  let quote = '', previous = '';
  let j = start;
  for (; j < html.length; j++) {
    const c = html[j]!;
    if (quote) { if (c === quote) quote = ''; continue; }
    if ((c === '"' || c === "'") && previous === '=') quote = c;
    else if (c === '>') break;
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '\f') previous = c;
  }
  if (j >= html.length) return { kind: 'skip', next: html.length };
  return { kind: 'tag', closing, name: name[0].toLowerCase(), attrs: html.slice(start, j), next: j + 1 };
}

export function extractPage(html: string): ExtractedPage {
  let title = '';
  let base: string | null = null;
  let noindex = false, nofollow = false;
  const links: string[] = [];
  // Блоки с пометкой «внутри main/article» — для выбора основного содержимого.
  const blocks: Array<Block & { main: boolean }> = [];
  let buffer = '';
  let skipDepth = 0, mainDepth = 0;
  let heading: { level: Block['level']; text: string } | null = null;
  const flush = () => {
    const text = squash(buffer);
    buffer = '';
    if (text) blocks.push({ kind: 'text', text, main: mainDepth > 0 });
  };
  let position = 0;
  while (position < html.length) {
    const token = nextToken(html, position);
    position = token.next;
    if (token.kind === 'skip') continue;
    if (token.kind === 'text') {
      if (skipDepth === 0) { if (heading) heading.text += token.text; else buffer += token.text; }
      continue;
    }
    const { closing, name, attrs } = token;
    if (!closing && (RAW.has(name) || name === 'title')) {
      // Поиск закрывающего тега без копии документа: регистронезависимый регэксп с lastIndex — O(хвоста),
      // а не html.toLowerCase() на каждый тег (O(документ × теги), ревью crawler BLOCKER-2).
      const closer = closerFor(name);
      closer.lastIndex = position;
      const end = closer.exec(html)?.index ?? -1;
      const inner = html.slice(position, end < 0 ? html.length : end);
      if (name === 'title' && !title) title = squash(inner);
      position = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (name === 'meta' && /^robots$/i.test(attribute(attrs, 'name') ?? '')) {
      const content = (attribute(attrs, 'content') ?? '').toLowerCase();
      if (/\b(noindex|none)\b/.test(content)) noindex = true;
      if (/\b(nofollow|none)\b/.test(content)) nofollow = true;
      continue;
    }
    if (name === 'base' && !closing && base === null) { base = attribute(attrs, 'href'); continue; }
    // <header> вне main/article — шапка сайта (навигация); внутри статьи — её заголовок, его сохраняем.
    const skipsHere = SKIP.has(name) || (name === 'header' && mainDepth === 0);
    if (skipsHere) {
      if (closing) { if (skipDepth > 0) skipDepth--; }
      else if (!VOID.has(name) && !/\/\s*$/.test(attrs)) { flush(); skipDepth++; }
      continue;
    }
    if (name === 'a' && !closing) {
      const href = attribute(attrs, 'href');
      if (href !== null && !/\bnofollow\b/i.test(attribute(attrs, 'rel') ?? '')) links.push(href);
    }
    if (skipDepth > 0) continue;
    if (name === 'main' || name === 'article') { if (closing) { flush(); mainDepth = Math.max(0, mainDepth - 1); } else { flush(); mainDepth++; } continue; }
    const level = /^h([1-6])$/.exec(name);
    if (level) {
      if (!closing) { flush(); heading = { level: Number(level[1]) as Block['level'], text: '' }; }
      else if (heading) {
        const text = squash(heading.text);
        if (text) blocks.push({ kind: 'heading', level: heading.level, text, main: mainDepth > 0 });
        heading = null;
      }
      continue;
    }
    if (BLOCK.has(name)) { if (heading) heading.text += ' '; else flush(); }
  }
  flush();
  const mainBlocks = blocks.filter((b) => b.main);
  const length = (list: Block[]) => list.reduce((n, b) => n + b.text.length, 0);
  const chosen = length(mainBlocks) >= CRAWL_MIN_TEXT_CHARS ? mainBlocks : blocks;
  const clean: Block[] = chosen.map(({ main: _main, ...block }) => block);
  return {
    title: title || clean.find((b) => b.kind === 'heading' && b.level === 1)?.text || '',
    headings: clean.filter((b) => b.kind === 'heading').map((b) => ({ level: b.level!, text: b.text })),
    blocks: clean,
    text: clean.map((b) => b.text).join('\n'),
    links, base, noindex, nofollow,
  };
}

// Отпечаток содержимого страницы: заголовок + текст. Он решает «без изменений» при повторе (FR-INDEX-003).
export const contentHash = (page: Pick<ExtractedPage, 'title' | 'text'>) =>
  createHash('sha256').update(`${page.title}\n${page.text}`, 'utf8').digest('hex');

// Кодировка: charset из Content-Type, затем <meta charset> в первых 1024 байтах, иначе UTF-8.
export function decodeHtml(body: Buffer, contentType: string): string {
  const fromHeader = /charset\s*=\s*"?([\w-]+)/i.exec(contentType)?.[1];
  const head = body.subarray(0, 1024).toString('latin1');
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromMeta, 'utf-8']) {
    if (!label) continue;
    try { return new TextDecoder(label.toLowerCase()).decode(body); } catch { /* неизвестная метка — следующая */ }
  }
  return body.toString('utf8');
}
