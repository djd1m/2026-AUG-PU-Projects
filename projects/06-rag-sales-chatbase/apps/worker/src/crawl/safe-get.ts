// GET краулера по ПРОВЕРЕННОМУ адресу (CheckAddress п.3, ADR-010) — написано заново (ADR-016).
// ADR-010 называл undici; взят встроенный node:http(s) — ноль новых зависимостей, и соединение идёт
// прямо на проверенный IP (host = IP, Host и SNI — имя сайта), так что второго DNS-запроса нет вовсе.
// Перенаправления вручную: каждый Location — снова форма + DNS + проверка КАЖДОГО адреса, не более 5.
// Каждый запрос (включая шаг перенаправления) проходит паузу: ≤ 1 запрос/с на сайт (NFR-SEC-004).
// Тело читается только если вызывающий его принимает, и обрывается на потолке байт; в журнал не пишется.
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { checkAddress, systemResolver, type CheckedAddress, type Resolver } from './check-address';

// Шов для тестов на локальном сервере: куда РЕАЛЬНО соединяться для проверенного (ip, port). В работе —
// тождество. Проверка адреса выполняется ДО него всегда: тест подменяет только маршрут, не политику.
export type Dialer = (ip: string, port: number) => { address: string; port: number };
export interface NetOptions { resolve?: Resolver; dial?: Dialer }
const directDial: Dialer = (address, port) => ({ address, port });

export type FetchFailure = 'timeout' | 'unreachable' | 'too_many_redirects' | 'off_site' | 'downgrade';
export class FetchFailed extends Error {
  constructor(readonly reason: FetchFailure) { super(`Запрос не выполнен: ${reason}`); this.name = 'FetchFailed'; }
}

type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Вежливость: между НАЧАЛАМИ любых двух запросов к сайту — не меньше pauseMs. Один поток на обход.
export class Pacer {
  private last = Number.NEGATIVE_INFINITY;
  constructor(private readonly pauseMs: number, private readonly sleep: Sleep = defaultSleep, private readonly clock: () => number = Date.now) {}
  async wait(): Promise<void> {
    const delay = this.last + this.pauseMs - this.clock();
    if (delay > 0) await this.sleep(delay);
    this.last = this.clock();
  }
}

export interface GetOptions {
  userAgent: string; accept: string; timeoutMs: number; maxBytes: number; maxRedirects: number;
  pacer: { wait(): Promise<void> }; net?: NetOptions;
  // Читать ли тело: решается по статусу и Content-Type ДО чтения (не-HTML не скачивается).
  wantBody: (status: number, contentType: string) => boolean;
  // Каждый шаг перенаправления обязан остаться в пределах (хост сайта); иначе off_site без соединения.
  inScope?: (url: URL) => boolean;
}
export interface GetResult {
  url: URL; status: number; contentType: string; body: Buffer | null; tooLarge: boolean; encoded: boolean; redirects: number;
}
interface Once { status: number; contentType: string; location?: string; body: Buffer | null; tooLarge: boolean; encoded: boolean }

function requestOnce(checked: CheckedAddress, options: GetOptions): Promise<Once> {
  const { url } = checked;
  const target = (options.net?.dial ?? directDial)(checked.ip, checked.port);
  const hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const client = url.protocol === 'https:' ? https : http;
  return new Promise<Once>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => { if (!settled) { settled = true; clearTimeout(timer); action(); } };
    const request = client.request({
      host: target.address, port: target.port, family: isIP(target.address) === 6 ? 6 : 4,
      path: `${url.pathname}${url.search}`, method: 'GET', agent: false,
      servername: isIP(hostname) ? undefined : hostname,
      headers: { host: url.host, 'user-agent': options.userAgent, accept: options.accept, 'accept-encoding': 'identity' },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      const location = response.headers.location;
      const done = (result: Omit<Once, 'status' | 'contentType'>) => finish(() => resolve({ status, contentType, ...result }));
      if (status >= 300 && status < 400 && location) { response.destroy(); done({ location, body: null, tooLarge: false, encoded: false }); return; }
      if (!options.wantBody(status, contentType)) { response.destroy(); done({ body: null, tooLarge: false, encoded: false }); return; }
      const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
      if (encoding !== 'identity') { response.destroy(); done({ body: null, tooLarge: false, encoded: true }); return; }
      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && declared > options.maxBytes) { response.destroy(); done({ body: null, tooLarge: true, encoded: false }); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        // Потолок по ФАКТИЧЕСКИМ байтам: Content-Length может отсутствовать или лгать.
        if (size > options.maxBytes) { response.destroy(); done({ body: null, tooLarge: true, encoded: false }); return; }
        chunks.push(chunk);
      });
      response.on('end', () => done({ body: Buffer.concat(chunks), tooLarge: false, encoded: false }));
      response.on('error', () => finish(() => reject(new FetchFailed('unreachable'))));
      response.on('close', () => finish(() => reject(new FetchFailed('unreachable'))));
    });
    const timer = setTimeout(() => { finish(() => reject(new FetchFailed('timeout'))); request.destroy(); }, options.timeoutMs);
    request.on('error', () => finish(() => reject(new FetchFailed('unreachable'))));
    request.end();
  });
}

// Следующий прыжок перенаправления. Понижение https → http запрещено (ревью crawler, MEDIUM-1): прыжок
// в открытом виде даёт посреднику на пути подменить содержимое уже проверенного сайта.
export function nextHop(current: URL, location: string): URL {
  let next: URL;
  try { next = new URL(location, current); } catch { throw new FetchFailed('unreachable'); }
  if (current.protocol === 'https:' && next.protocol === 'http:') throw new FetchFailed('downgrade');
  next.hash = '';
  return next;
}

// Бросает AddressRefused (blocked_address | unreachable) или FetchFailed; иначе — ответ последнего шага.
export async function safeGet(start: string | URL, options: GetOptions): Promise<GetResult> {
  let url = new URL(String(start));
  const resolve = options.net?.resolve ?? systemResolver;
  for (let hop = 0; ; hop++) {
    // Сначала политика адреса (запрещённая цель называется blocked_address, а не off_site), затем пределы сайта.
    const checked = await checkAddress(url, resolve);
    if (options.inScope && !options.inScope(checked.url)) throw new FetchFailed('off_site');
    await options.pacer.wait();
    const once = await requestOnce(checked, options);
    if (once.location !== undefined) {
      if (hop >= options.maxRedirects) throw new FetchFailed('too_many_redirects');
      url = nextHop(checked.url, once.location);
      continue;
    }
    return { url: checked.url, status: once.status, contentType: once.contentType, body: once.body, tooLarge: once.tooLarge,
      encoded: once.encoded, redirects: hop };
  }
}
