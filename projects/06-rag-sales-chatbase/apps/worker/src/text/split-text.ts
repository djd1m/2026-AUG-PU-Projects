// Разбор текстового файла на «страницы» (text-source, A-N6-080, FR-SOURCE-005) — написано заново.
// Раздел = заголовок Markdown `#` или `##` (вне блоков кода); `###…######` — заголовки ВНУТРИ раздела (контекст фрагмента).
// Текст до первого заголовка — раздел без якоря (адрес файла). Раздел без текста (только заголовок) — не страница.
// llms.txt (`# Имя`, `> описание`, `## Раздел` со списком ссылок) делится теми же правилами: раздел — `##` со ссылками;
// ссылки `[имя](адрес)` становятся текстом «имя (адрес)» — по ним НЕ ходим (это был бы обход сайта, у файла его нет).
// Содержимое — ДАННЫЕ чужого сайта: здесь только режется, исполняется и отображается как текст (ADR-003, ADR-005).
import { createHash } from 'node:crypto';
import { CONTEXT_PATH_SEPARATOR, type ChunkBlock } from '@n6/rag';

export interface TextSection {
  anchor: string | null;         // slug заголовка раздела; null — текст до первого заголовка
  title: string;                 // «# › ##» — заголовок страницы и плашки источника
  blocks: ChunkBlock[];          // заголовки ### и строки текста — вход ChunkDocument
  contentHash: string;           // sha256 заголовка и содержимого: «Обновить» не эмбеддит неизменный раздел
}
export interface SplitResult { sections: TextSection[]; emptySections: number }

export const SECTION_TITLE_MAX_CHARS = 200;
export const ANCHOR_MAX_CHARS = 100;

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// Якорь как у GitHub: нижний регистр, буквы и цифры ЛЮБОГО алфавита (\p{L}\p{N}), «-» и «_»; пробелы → «-».
export function slugify(heading: string): string {
  return heading.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-')
    .slice(0, ANCHOR_MAX_CHARS).replace(/-+$/, '');
}

// Строка текста без разметки ссылок и управляющих символов. Изображение — только подпись.
export function plainLine(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, href: string) => (text.trim() === href.trim() ? href : `${text} (${href})`))
    .replace(/^ {0,3}(?:>\s?)+/, '')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\t' ? ' ' : ''))
    .trim();
}

const cap = (text: string, max: number) => Array.from(text).slice(0, max).join('');

export function splitTextFile(input: string): SplitResult {
  const lines = input.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const sections: TextSection[] = [];
  const used = new Map<string, number>();
  let emptySections = 0;
  let h1: string | null = null;
  let current: { anchor: string | null; title: string; blocks: ChunkBlock[] } = { anchor: null, title: '', blocks: [] };
  let fence: string | null = null;

  const uniqueAnchor = (heading: string): string => {
    const base = slugify(heading) || `razdel-${sections.length + emptySections + 1}`;
    const seen = used.get(base);
    used.set(base, (seen ?? -1) + 1);
    return seen === undefined ? base : `${base}-${seen + 1}`;
  };
  const flush = () => {
    const hasText = current.blocks.some((b) => b.kind === 'text' && b.text.length > 0);
    if (hasText) {
      const body = current.blocks.map((b) => (b.kind === 'heading' ? `${'#'.repeat(b.level ?? 3)} ${b.text}` : b.text)).join('\n');
      sections.push({ ...current, contentHash: createHash('sha256').update(`${current.anchor ?? ''}\n${current.title}\n${body}`, 'utf8').digest('hex') });
    } else if (current.anchor !== null || current.blocks.length) {
      emptySections++;
    }
  };
  for (const raw of lines) {
    const fenceMark = FENCE.exec(raw)?.[1];
    if (fence) {
      if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length && raw.trim() === fenceMark) { fence = null; continue; }
      const line = plainLine(raw);
      if (line) current.blocks.push({ kind: 'text', text: line });
      continue;
    }
    if (fenceMark) { fence = fenceMark; continue; }
    const heading = HEADING.exec(raw);
    if (heading) {
      const level = heading[1]!.length;
      const text = plainLine((heading[2] ?? '').replace(/[ \t]+#+$/, '').replace(/^#+$/, ''));
      if (!text) continue;
      if (level <= 2) {
        flush();
        if (level === 1) h1 = text;
        const title = level === 2 && h1 ? `${h1}${CONTEXT_PATH_SEPARATOR}${text}` : text;
        current = { anchor: uniqueAnchor(text), title: cap(title, SECTION_TITLE_MAX_CHARS), blocks: [] };
      } else {
        current.blocks.push({ kind: 'heading', level, text });
      }
      continue;
    }
    const line = plainLine(raw);
    if (line) current.blocks.push({ kind: 'text', text: line });
  }
  flush();
  return { sections, emptySections };
}

// Адрес «страницы» раздела: адрес файла + #якорь (плашка источника ведёт на файл; адрес страницы сайта не выдумываем).
export function sectionUrl(fileUrl: URL, anchor: string | null): string {
  const url = new URL(fileUrl.href);
  url.hash = anchor ?? '';
  return url.href;
}
// Путь для примера непрочитанного в ленте: путь файла + #якорь, раскодированный, без управляющих символов, ≤ 200.
export function sectionDisplay(fileUrl: URL, anchor: string | null): string {
  const path = `${fileUrl.pathname}${anchor ? `#${anchor}` : ''}`;
  let shown = path;
  try { shown = decodeURIComponent(path); } catch { /* как есть */ }
  shown = shown.replace(/[\p{Cc}\p{Cf}]/gu, (c) => encodeURIComponent(c));
  return cap(shown, 200);
}
