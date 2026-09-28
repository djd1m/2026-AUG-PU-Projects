// Загрузка текстового файла по адресу (text-source, A-N6-080, FR-SOURCE-005; ADR-010 — все проверки «чужого адреса»).
// Порядок — это защита: форма адреса (http/https, 80/443, без учётных данных) → robots.txt origin'а (через CheckAddress) →
// сам файл через safeGet: CheckAddress после DNS и на КАЖДОМ перенаправлении, соединение по проверенному IP, только хост
// файла и его www., таймаут, пауза между запросами, потолок байт по заявленному И по принятому. Тип — по заголовку ДО
// чтения тела (HTML не скачивается), затем по содержимому (HTML-разметка, NUL, непригодная кодировка — не текст).
// Переиспользованы детали краулера (safe-get, robots, check-address) — второй реализации проверок адреса нет.
import { createHash } from 'node:crypto';
import { TEXT_MAX_BYTES } from '@n6/rag';
import { AddressRefused, checkUrlShape } from '../crawl/check-address';
import { siteHosts } from '../crawl/crawl-site';
import { CRAWL_MAX_REDIRECTS, CRAWL_PAGE_TIMEOUT_MS, CRAWL_PAUSE_MS } from '../crawl/limits';
import { fetchRobots, isAllowed, type Robots } from '../crawl/robots';
import { FetchFailed, Pacer, safeGet, type NetOptions } from '../crawl/safe-get';

export type TextFailureReason = 'blocked_address' | 'unreachable' | 'robots_disallowed' | 'too_large' | 'not_text';
// code — подробность для журнала воркера (без содержимого файла); reason — закрытый набор канона §4.
export class TextFetchFailure extends Error {
  constructor(readonly reason: TextFailureReason, readonly code: string) { super(`Текстовый файл не прочитан: ${reason} (${code})`); this.name = 'TextFetchFailure'; }
}
export interface FetchTextOptions {
  url: string; userAgent: string; net?: NetOptions;
  // Числа канона по умолчанию; тесты сжимают время и предел, не политику.
  pauseMs?: number; timeoutMs?: number; maxBytes?: number; sleep?: (ms: number) => Promise<void>; clock?: () => number;
}
export interface FetchedText { url: URL; text: string; bytes: number; sha256: string; requests: number }

// Принимаемые типы: обычный текст и Markdown. Всё прочее, включая HTML, — не текст.
export const isTextType = (contentType: string) => /^text\/(plain|markdown|x-markdown)(\s*;|$)/.test(contentType);
const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)(\s*;|$)/;
// Начало документа — HTML-разметка (частый случай: сайт отдаёт страницу-заглушку 200 с text/plain или без типа).
export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!--[\s\S]*?-->\s*)*<(!doctype\s+html|html[\s>]|head[\s>]|body[\s>])/i.test(text.slice(0, 2048));
}
const CHARSETS: Readonly<Record<string, string>> = { 'utf-8': 'utf-8', utf8: 'utf-8', 'us-ascii': 'utf-8', 'windows-1251': 'windows-1251', 'cp1251': 'windows-1251', 'koi8-r': 'koi8-r' };
export function decodeText(body: Buffer, contentType: string): string {
  const declared = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType)?.[1]?.toLowerCase() ?? 'utf-8';
  const charset = CHARSETS[declared];
  if (!charset) throw new TextFetchFailure('not_text', `charset:${declared.slice(0, 20)}`);
  let text: string;
  try { text = new TextDecoder(charset, { fatal: true }).decode(body); } catch { throw new TextFetchFailure('not_text', 'decode'); }
  text = text.replace(/^﻿/, '');
  if (text.includes('\u0000')) throw new TextFetchFailure('not_text', 'nul');
  if (looksLikeHtml(text)) throw new TextFetchFailure('not_text', 'html_body');
  return text;
}

export async function fetchTextFile(options: FetchTextOptions): Promise<FetchedText> {
  let url: URL;
  try { url = checkUrlShape(options.url); } catch (error) {
    if (error instanceof AddressRefused) throw new TextFetchFailure(error.reason, 'shape');
    throw error;
  }
  url.hash = '';
  const hosts = siteHosts(url);
  let requests = 0;
  const pacerBase = new Pacer(options.pauseMs ?? CRAWL_PAUSE_MS, options.sleep, options.clock);
  const pacer = { wait: async () => { requests++; await pacerBase.wait(); } };
  // Запреты robots.txt проверяются на КАЖДОМ шаге перенаправления ДО запроса (не после, как у краулера): перенаправление на
  // запрещённый путь того же origin'а не запрашивается вовсе. Другой origin (www.-вариант) — после, по его robots.txt.
  let robots: Robots | null = null;
  let robotsRefusedHop = false;
  const common = { userAgent: options.userAgent, timeoutMs: options.timeoutMs ?? CRAWL_PAGE_TIMEOUT_MS, pacer, net: options.net,
    inScope: (u: URL) => {
      if (!((u.protocol === 'http:' || u.protocol === 'https:') && hosts.has(u.hostname.toLowerCase()))) return false;
      if (robots && u.origin === url.origin && !isAllowed(robots, u.pathname + u.search)) { robotsRefusedHop = true; return false; }
      return true;
    } };
  const maxBytes = options.maxBytes ?? TEXT_MAX_BYTES;

  // 1. robots.txt ДО файла. Отказ адреса или недоступность — отказ (читать, не зная запретов сайта, нельзя).
  const robotsFor = async (origin: string) => {
    const outcome = await fetchRobots(origin, common);
    if (outcome.kind === 'refused') throw new TextFetchFailure(outcome.reason, 'robots');
    return outcome.robots;
  };
  robots = await robotsFor(url.origin);
  if (!isAllowed(robots, url.pathname + url.search)) throw new TextFetchFailure('robots_disallowed', 'robots');

  // 2. Сам файл. Тело читается только у 2xx с текстовым типом; HTML и прочее — без чтения тела.
  let result;
  try {
    result = await safeGet(url, { ...common, accept: 'text/plain,text/markdown;q=0.9,*/*;q=0.1', maxBytes, maxRedirects: CRAWL_MAX_REDIRECTS,
      wantBody: (status, type) => status >= 200 && status < 300 && isTextType(type) });
  } catch (error) {
    if (error instanceof AddressRefused) throw new TextFetchFailure(error.reason, 'address');
    if (error instanceof FetchFailed && robotsRefusedHop) throw new TextFetchFailure('robots_disallowed', 'robots_redirect');
    if (error instanceof FetchFailed) throw new TextFetchFailure('unreachable', error.reason);
    throw error;
  }
  // Перенаправление привело на другой путь или на www.-вариант: запреты robots цели действуют так же.
  const final = result.url;
  if (final.href !== url.href) {
    const finalRobots = final.origin === url.origin ? robots! : await robotsFor(final.origin);
    if (!isAllowed(finalRobots, final.pathname + final.search)) throw new TextFetchFailure('robots_disallowed', 'robots_redirect');
  }
  if (result.status < 200 || result.status >= 300) throw new TextFetchFailure('unreachable', `http_${result.status}`);
  if (HTML_TYPE.test(result.contentType)) throw new TextFetchFailure('not_text', 'html_type');
  if (!isTextType(result.contentType)) throw new TextFetchFailure('not_text', `type:${result.contentType.split(';')[0]!.slice(0, 40) || 'none'}`);
  if (result.tooLarge) throw new TextFetchFailure('too_large', 'bytes');
  if (result.encoded || !result.body) throw new TextFetchFailure('unreachable', 'encoding');
  if (result.body.length > maxBytes) throw new TextFetchFailure('too_large', 'bytes');
  const text = decodeText(result.body, result.contentType);
  return { url: final, text, bytes: result.body.length, sha256: createHash('sha256').update(result.body).digest('hex'), requests };
}
