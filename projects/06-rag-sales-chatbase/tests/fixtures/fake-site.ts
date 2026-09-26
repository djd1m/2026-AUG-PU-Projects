// Подменный сайт для тестов краулера: настоящий HTTP-сервер на 127.0.0.1 ВНУТРИ тестового процесса
// (в интернет тесты не ходят). Политика адресов при этом НЕ подменяется: краулер проверяет адреса,
// которые вернул подменный DNS, а шов dial лишь направляет соединение с проверенного ПУБЛИЧНОГО адреса
// на локальный порт. Любая попытка соединиться с другим адресом записывается и проваливает запрос —
// так тест видит, что к запрещённому адресу не было НИ ОДНОГО соединения.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NetOptions } from '../../apps/worker/src/crawl/safe-get';

export const PUBLIC_IP = '93.184.215.14';
export type Handler = (request: http.IncomingMessage, response: http.ServerResponse) => void;
export interface FakeSite {
  port: number; net: NetOptions; dials: string[]; resolved: string[];
  requests: Array<{ path: string; host: string; userAgent: string; at: number }>;
  aborted: () => number; close: () => Promise<void>;
}

export async function startFakeSite(routes: Record<string, Handler>, dns: Record<string, string[]> = {}): Promise<FakeSite> {
  const requests: FakeSite['requests'] = [];
  let aborted = 0;
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url ?? '', host: String(request.headers.host ?? ''), userAgent: String(request.headers['user-agent'] ?? ''), at: Date.now() });
    response.on('close', () => { if (!response.writableFinished) aborted++; });
    const handler = routes[request.url ?? ''] ?? routes['*'];
    if (handler) handler(request, response);
    else { response.statusCode = 404; response.end('нет'); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const dials: string[] = [], resolved: string[] = [];
  const zone: Record<string, string[]> = { 'site.example': [PUBLIC_IP], 'www.site.example': [PUBLIC_IP], ...dns };
  const net: NetOptions = {
    resolve: async (host) => {
      resolved.push(host);
      const answer = zone[host];
      if (!answer) throw new Error('NXDOMAIN');
      return answer;
    },
    dial: (ip, targetPort) => {
      dials.push(ip);
      if (ip !== PUBLIC_IP || (targetPort !== 80 && targetPort !== 443)) throw new Error(`соединение с непроверенным адресом ${ip}:${targetPort}`);
      return { address: '127.0.0.1', port };
    },
  };
  return {
    port, net, dials, resolved, requests, aborted: () => aborted,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

export const html = (body: string, status = 200, headers: Record<string, string> = {}): Handler => (_q, response) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
  response.end(body);
};
export const text = (body: string, type = 'text/plain', status = 200): Handler => (_q, response) => {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
};
export const redirect = (location: string, status = 302): Handler => (_q, response) => {
  response.writeHead(status, { location });
  response.end();
};
// Страница с текстом не короче порога (200 символов) и ссылками.
export const article = (title: string, links: string[] = [], extra = '') => html(`<!doctype html><html><head><title>${title}</title></head><body>
<nav><a href="/">Главная</a> меню сайта навигация</nav>
<main><h1>${title}</h1><p>${`Содержательный абзац страницы «${title}» о ценах, доставке и гарантии. `.repeat(6)}</p>${extra}
${links.map((l) => `<a href="${l}">ссылка</a>`).join(' ')}</main><footer>Подвал © Компания</footer></body></html>`);
