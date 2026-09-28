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
// Документ НАЧИНАЕТСЯ с HTML-разметки — это HTML (частый случай: сайт отдаёт страницу-заглушку 200 с text/plain). Ведущие
// пробелы и комментарии пропускаются целиком, без окна (ревью Codex круг 1: 2048 пробелов уводили разметку за окно);
// любой открывающий тег, doctype или <?xml в начале — не текст. Цена: Markdown, начинающийся с HTML-тега (README с
// <p align="center">), тоже отказ not_text — fail-closed, в тексте отказа сказано, какой файл нужен.
export function looksLikeHtml(text: string): boolean {
  const start = text.replace(/^(\s|<!--[\s\S]*?-->)+/, '').slice(0, 64);
  return /^<(!doctype[\s>]|\?xml[\s?]|[a-z][a-z0-9-]*(\s|>|\/>))/i.test(start);
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
  const hostOk = (u: URL) => (u.protocol === 'http:' || u.protocol === 'https:') && hosts.has(u.hostname.toLowerCase());
  const common = { userAgent: options.userAgent, timeoutMs: options.timeoutMs ?? CRAWL_PAGE_TIMEOUT_MS, pacer, net: options.net, inScope: hostOk };
  const maxBytes = options.maxBytes ?? TEXT_MAX_BYTES;

  // 1. robots.txt ДО файла. Отказ адреса или недоступность — отказ (читать, не зная запретов сайта, нельзя).
  const robotsCache = new Map<string, Robots>();
  const robotsFor = async (origin: string) => {
    const cached = robotsCache.get(origin);
    if (cached) return cached;
    const outcome = await fetchRobots(origin, common);
    if (outcome.kind === 'refused') throw new TextFetchFailure(outcome.reason, 'robots');
    robotsCache.set(origin, outcome.robots);
    return outcome.robots;
  };
  if (!isAllowed(await robotsFor(url.origin), url.pathname + url.search)) throw new TextFetchFailure('robots_disallowed', 'robots');
  // Запреты robots.txt — на КАЖДОМ шаге перенаправления ДО запроса (строже краулера): robots.txt origin'а шага (включая
  // www.-вариант и промежуточные) читается до того, как шаг запрошен; запрещённый путь не запрашивается вовсе (ревью Codex
  // круг 1: www.-вариант проверялся только после загрузки).
  let robotsRefusedHop = false;
  const fileScope = async (u: URL) => {
    if (!hostOk(u)) return false;
    if (!isAllowed(await robotsFor(u.origin), u.pathname + u.search)) { robotsRefusedHop = true; return false; }
    return true;
  };

  // 2. Сам файл. Тело читается только у 2xx с текстовым типом; HTML и прочее — без чтения тела.
  let result;
  try {
    result = await safeGet(url, { ...common, inScope: fileScope, accept: 'text/plain,text/markdown;q=0.9,*/*;q=0.1', maxBytes, maxRedirects: CRAWL_MAX_REDIRECTS,
      wantBody: (status, type) => status >= 200 && status < 300 && isTextType(type) });
  } catch (error) {
    if (error instanceof AddressRefused) throw new TextFetchFailure(error.reason, 'address');
    if (error instanceof FetchFailed && robotsRefusedHop) throw new TextFetchFailure('robots_disallowed', 'robots_redirect');
    if (error instanceof FetchFailed) throw new TextFetchFailure('unreachable', error.reason);
    throw error;
  }
  const final = result.url;   // каждый шаг, включая последний, уже прошёл fileScope: адрес, хост и robots.txt его origin'а
  if (result.status < 200 || result.status >= 300) throw new TextFetchFailure('unreachable', `http_${result.status}`);
  if (HTML_TYPE.test(result.contentType)) throw new TextFetchFailure('not_text', 'html_type');
  if (!isTextType(result.contentType)) throw new TextFetchFailure('not_text', `type:${result.contentType.split(';')[0]!.slice(0, 40) || 'none'}`);
  if (result.tooLarge) throw new TextFetchFailure('too_large', 'bytes');
  if (result.encoded || !result.body) throw new TextFetchFailure('unreachable', 'encoding');
  if (result.body.length > maxBytes) throw new TextFetchFailure('too_large', 'bytes');
  const text = decodeText(result.body, result.contentType);
  return { url: final, text, bytes: result.body.length, sha256: createHash('sha256').update(result.body).digest('hex'), requests };
}
