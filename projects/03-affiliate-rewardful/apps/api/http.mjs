import { createServer } from 'node:http';
import { apiOrigins as origins } from '../../shared/contracts/deployment.mjs';

const MAX_BODY = 65536;
const rates = new Map();
function rate(key, limit, now = Date.now()) {
  let row = rates.get(key);
  if (!row || row.until <= now) { row = { n: 0, until: now + 60000 }; rates.set(key, row); }
  if (rates.size > 2048) for (const [id, x] of rates) if (x.until <= now) rates.delete(id);
  row.n += 1;
  return row.n <= limit;
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw Object.assign(new Error('Требуется application/json.'), { status: 415, code: 'CONTENT_TYPE' });
  }
  let length = 0; const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw Object.assign(new Error('Запрос слишком большой.'), { status: 413, code: 'BODY_LIMIT' });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw Object.assign(new Error('Некорректный JSON.'), { status: 400, code: 'INVALID_JSON' }); }
}

export function createHttpServer(app, { mode = 'fixture' } = {}) {
  if (mode !== 'fixture') throw new Error('Only explicit fixture mode is supported.');
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return json(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Источник запроса не разрешён.' } });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    let path;
    try { path = new URL(req.url, 'http://n3.local').pathname; }
    catch { return json(res, 400, { error: { code: 'INVALID_URL', message: 'Некорректный адрес запроса.' } }); }
    if (req.method === 'OPTIONS') {
      if (!['/api/demo', '/api/command'].includes(path)) return json(res, 404, { error: { code: 'NOT_FOUND' } });
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '300' });
      return res.end();
    }
    if (path === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', mode, version: '0.1.0' });
    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Круг — лаборатория</title><h1>Круг: четыре сценария</h1><p>Функциональный стенд · синтетические данные · реальные деньги не отправляются</p><ul>' + ['A — Владелец','B — Клиент','C — Партнёр','D — Агент'].map((title,i)=>`<li><a href="http://127.0.0.1:${13031+i}/">${title}</a></li>`).join('') + '</ul><p>Каждый новый независимый сеанс использует отдельные данные. Для ручного продолжения D→A используйте ссылку внутри задачи.</p></html>');
    }
    if (!['/api/demo', '/api/command'].includes(path)) return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Маршрут не найден.' } });
    if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD', message: 'Требуется POST.' } });
    // Socket address is authoritative; forwarded headers cannot bypass quota.
    if (!rate(`${path}:${req.socket.remoteAddress}`, path === '/api/demo' ? 30 : 300)) {
      res.setHeader('Retry-After', '60');
      return json(res, 429, { error: { code: 'RATE_LIMIT', message: 'Слишком много запросов. Повторите через минуту.' } });
    }
    try {
      const data = await body(req);
      if (path === '/api/demo') return json(res, 201, { data: await app.createDemo(data) });
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return json(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Откройте новый демосеанс.' } });
      if (typeof data.action !== 'string' || data.action.length > 80 || typeof data.actorId !== 'string') {
        throw Object.assign(new Error('Укажите действие и действующего пользователя.'), { status: 400, code: 'VALIDATION' });
      }
      const result = await app.execute({ token, actorId: data.actorId, grantId: data.grantId }, data.action, data.input ?? {}, data.idempotencyKey);
      return json(res, 200, { data: result });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 503;
      const code = status < 500 && typeof error.code === 'string' ? error.code : 'UNAVAILABLE';
      json(res, status, { error: { code, message: status < 500 ? error.message : 'Сервис временно недоступен. Повторите тот же запрос.' } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
