import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PUBLIC_ROOT } from './config.js';
import { Capacity, HttpError, RateLimiter, credentials, readBody, readJson, requireOrigin } from './boundaries.js';
import { cookie, createAuth } from './auth.js';
import { MAX_BYTES, createMedia } from './media.js';

const STATIC = new Map([['/', ['index.html','text/html; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']], ['/style.css',['style.css','text/css; charset=utf-8']]]);
export function createApp(pool, config) {
  const auth = createAuth(pool,config.secret); const media = createMedia(pool,config.storageDir);
  const rates = new RateLimiter(); const authCapacity = new Capacity(4); const uploadCapacity = new Capacity(2);
  const server = createServer(async (req,res) => {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url,'http://internal'); const path = url.pathname;
      if (url.search || /%|\\/.test(path)) throw new HttpError(400,'invalid_path');
      if (req.method === 'GET' && STATIC.has(path)) {
        const [file,type] = STATIC.get(path);
        res.writeHead(200,{'Content-Type':type}); res.end(await readFile(join(PUBLIC_ROOT,file))); return;
      }
      if (!path.startsWith('/api/')) throw new HttpError(404,'not_found');
      const ip = req.socket.remoteAddress ?? 'unknown'; // Never trust caller X-Forwarded-For.
      rates.take(`public:${ip}`,120,60000);
      if (!['GET','HEAD'].includes(req.method)) requireOrigin(req,config.origin);
      if (req.method === 'POST' && ['/api/register','/api/login'].includes(path)) {
        if (path === '/api/register') rates.take(`register:${ip}`,5,3600000);
        else rates.take(`login-ip:${ip}`,50,900000);
        const input = credentials(await readJson(req));
        if (path === '/api/login') rates.take(`login:${ip}:${input.email}`,10,900000);
        const token = await authCapacity.run(() => path === '/api/register' ? auth.register(input.email,input.password) : auth.login(input.email,input.password));
        res.setHeader('Set-Cookie',cookie(token,config.secureCookie)); send(path === '/api/register' ? 201 : 200,{ ok:true }); return;
      }
      if (req.method === 'POST' && path === '/api/logout') {
        await readJson(req); await auth.logout(req);
        res.setHeader('Set-Cookie',cookie('',config.secureCookie,true)); send(200,{ok:true}); return;
      }
      const account = await auth.authenticate(req);
      if (req.method === 'GET' && path === '/api/me') { send(200,{account}); return; }
      if (req.method === 'GET' && path === '/api/uploads') { send(200,{uploads:await media.list(account.id)}); return; }
      if (req.method === 'POST' && path === '/api/uploads') {
        const upload = await uploadCapacity.run(async () => {
          const mime = req.headers['content-type'];
          if (mime?.split(';')[0] === 'application/json') { await readJson(req); throw new HttpError(400,'image_bytes_required'); }
          if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new HttpError(422,'invalid_image');
          return media.save(account.id,await readBody(req,MAX_BYTES),mime);
        });
        send(201,{upload}); return;
      }
      const match = /^\/api\/uploads\/([^/]+)$/.exec(path);
      if (match && req.method === 'GET') {
        const image = await media.read(account.id,match[1]);
        res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.data.length}); res.end(image.data); return;
      }
      if (match && req.method === 'DELETE') { await readBody(req,16384); await media.delete(account.id,match[1]); send(200,{ok:true}); return; }
      throw new HttpError(404,'not_found');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      const code = error instanceof HttpError ? error.code : 'service_unavailable';
      if (!(error instanceof HttpError)) console.error('request_failed');
      if (!res.headersSent && !res.destroyed) {
        res.setHeader('Connection','close');
        if (status === 429) res.setHeader('Retry-After','60');
        send(status,{error:code});
      } else res.destroy();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  return server;
}
