import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createFrontendServer({staticRoot = '/app/public', apiOrigin = 'http://api:3000'} = {}) {
const root = resolve(staticRoot);
const upstream = new URL(apiOrigin);
if (upstream.protocol !== 'http:' || !['api', '127.0.0.1', 'localhost'].includes(upstream.hostname)) throw new Error('Untrusted API origin');
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.ttf':'font/ttf', '.svg':'image/svg+xml', '.json':'application/json' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  let url;
  try { url = new URL(req.url, 'http://local'); }
  catch { res.writeHead(400, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Некорректный адрес запроса'); return; }
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    const proxy = request(new URL(url.pathname + url.search, upstream), {
      method: req.method, headers: { ...req.headers, host: upstream.host }, timeout: 12000,
    }, remote => { res.writeHead(remote.statusCode, remote.headers); remote.pipe(res); });
    proxy.on('timeout', () => proxy.destroy());
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":{"code":"UNAVAILABLE","message":"Нет связи с сервером. Повторите запрос."}}'); });
    req.on('aborted', () => proxy.destroy());
    req.pipe(proxy); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  try {
    const relative = decodeURIComponent(['/', '/join'].includes(url.pathname) ? '/index.html' : url.pathname);
    const path = resolve(root, '.' + relative);
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) throw new Error();
    const type = types[extname(path)];
    if (!type) throw new Error();
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://127.0.0.1:13030 http://127.0.0.1:13032 http://localhost:13030 http://localhost:13032; frame-src 'self' http://127.0.0.1:13032 http://localhost:13032; frame-ancestors 'self' http://127.0.0.1:13030 http://127.0.0.1:13031 http://localhost:13030 http://localhost:13031; base-uri 'none'; form-action 'self'");
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(path));
  } catch { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Страница не найдена'); }
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createFrontendServer({staticRoot:process.env.STATIC_ROOT,apiOrigin:process.env.API_ORIGIN})
    .listen(Number(process.env.PORT || 3000), '0.0.0.0');
}
