// HTTP-слой кабинета.
//
// ЗАЩИТА ФОРМ — Origin, как в приёме: сессионная cookie с SameSite=Lax сама по себе не
// закрывает POST с чужого сайта в старых браузерах, а токены CSRF потребовали бы
// состояния в разметке. Формы кабинета отдаём мы, значит Origin приходит всегда, и его
// отсутствие — отказ (fail-closed), а не «старый клиент».

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { login, register, resolveSession, SESSION_COOKIE, SESSION_TTL_MS, type Session } from './auth.js';
import { createPlace, listFeedback, listPlaces, setPlatformLink, type Platform } from './places.js';
import { withAccount, pool } from './db.js';
import { authPage, dashboardPage, feedbackPage, qrPage } from './pages.js';
import { guestUrl, qrSvg } from './qr.js';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const SECURE = BASE_URL.startsWith('https');

function html(res: ServerResponse, code: number, body: string, extra: Record<string, string> = {}): void {
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(body);
}
function redirect(res: ServerResponse, to: string, extra: Record<string, string> = {}): void {
  res.writeHead(303, { location: to, 'cache-control': 'no-store', ...extra });
  res.end();
}
function setSession(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${SECURE ? '; Secure' : ''}`;
}
function readCookie(req: IncomingMessage): string {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m?.[1] ?? '';
}
function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  return new Promise((resolve) => {
    let size = 0; const chunks: Buffer[] = [];
    const t = setTimeout(() => { req.pause(); resolve(null); }, 5_000);
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 32 * 1024) { clearTimeout(t); req.pause(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => { clearTimeout(t); resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))); });
    req.on('error', () => { clearTimeout(t); resolve(null); });
  });
}
/** Каждый POST кабинета проходит здесь. Отсутствие Origin — отказ. */
function originOk(req: IncomingMessage): boolean {
  return req.headers.origin === BASE_URL;
}

export const server = createServer((req, res) => {
  void handle(req, res).catch(() => html(res, 500, 'внутренняя ошибка'));
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const seg = path.split('/').filter(Boolean);
  const session = await resolveSession(readCookie(req));

  // ── без сессии
  if (req.method === 'GET' && (path === '/' || path === '/login'))
    return session ? redirect(res, '/dashboard') : html(res, 200, authPage('login'));
  if (req.method === 'GET' && path === '/register')
    return session ? redirect(res, '/dashboard') : html(res, 200, authPage('register'));

  if (req.method === 'POST' && (path === '/login' || path === '/register')) {
    if (!originOk(req)) return html(res, 403, authPage(path === '/login' ? 'login' : 'register', 'запрос отклонён'));
    const f = await readForm(req);
    if (!f) return html(res, 413, authPage('login', 'слишком большой запрос'));
    const email = (f.get('email') ?? '').trim().toLowerCase();
    const password = f.get('password') ?? '';
    if (path === '/register') {
      const r = await register(email, password, (f.get('account') ?? '').trim());
      if (!r.ok) return html(res, 422, authPage('register', r.error));
      return redirect(res, '/dashboard', { 'set-cookie': setSession(r.token) });
    }
    const r = await login(email, password);
    // ОДИН текст на неверный пароль и несуществующую почту — оракула перечисления нет.
    if (!r.ok) return html(res, 401, authPage('login', 'неверная почта или пароль'));
    return redirect(res, '/dashboard', { 'set-cookie': setSession(r.token) });
  }

  if (req.method === 'POST' && path === '/logout') {
    if (!originOk(req)) return redirect(res, '/dashboard');
    const token = readCookie(req);
    if (token) await pool.query(
      `update sessions set revoked_at = now() where token_hash = sha256($1::bytea)`, [Buffer.from(token)]);
    return redirect(res, '/login', { 'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0` });
  }

  // ── дальше только с сессией
  if (!session) return redirect(res, '/login');

  if (req.method === 'GET' && path === '/dashboard') {
    const places = await listPlaces(session.accountId);
    return html(res, 200, dashboardPage(places, BASE_URL));
  }

  if (req.method === 'POST' && path === '/places') {
    if (!originOk(req)) return html(res, 403, 'запрос отклонён');
    const f = await readForm(req);
    if (!f) return redirect(res, '/dashboard');
    const r = await createPlace(session.accountId, (f.get('slug') ?? '').trim(), (f.get('name') ?? '').trim());
    if (!r.ok) return html(res, 422, dashboardPage(await listPlaces(session.accountId), BASE_URL, r.error));
    return redirect(res, '/dashboard');
  }

  if (req.method === 'POST' && seg[0] === 'places' && seg[1] && seg[2] === 'links') {
    if (!originOk(req)) return html(res, 403, 'запрос отклонён');
    const f = await readForm(req);
    if (!f) return redirect(res, '/dashboard');
    for (const platform of ['yandex_maps', 'twogis'] as Platform[]) {
      const url = (f.get(platform) ?? '').trim();
      if (!url) continue;
      const r = await setPlatformLink(session.accountId, seg[1], platform, url);
      if (!r.ok) return html(res, 422, dashboardPage(await listPlaces(session.accountId), BASE_URL, `${platform}: ${r.error}`));
    }
    // Ссылки задели гостевую страницу — просим гостевой контейнер сбросить кэш точки.
    await invalidateGuestCache(session.accountId, seg[1]);
    return redirect(res, '/dashboard');
  }

  if (req.method === 'GET' && seg[0] === 'places' && seg[1] && seg[2] === 'qr' && seg.length === 3) {
    const places = await listPlaces(session.accountId);
    const place = places.find((p) => p.id === seg[1]);
    if (!place) return html(res, 404, 'не найдено');
    const href = guestUrl(BASE_URL, place.slug);
    return html(res, 200, qrPage(place.name, place.slug, await qrSvg(href), href));
  }

  if (req.method === 'GET' && seg[0] === 'places' && seg[1] && seg.length === 2) {
    const places = await listPlaces(session.accountId);
    const place = places.find((p) => p.id === seg[1]);
    // Чужая и несуществующая точка неотличимы: RLS вернула пустоту — 404.
    if (!place) return html(res, 404, 'не найдено');
    const items = await listFeedback(session.accountId, place.id);
    return html(res, 200, feedbackPage(place.name, items));
  }

  return html(res, 404, 'не найдено');
}

/** Явная инвалидация кэша гостя. Отказ канала — не ошибка владельцу: TTL добьёт за 60 с.
 *  Но отказ ЛОГИРУЕТСЯ — молчаливый фолбэк без следа лишил бы нас даже дорогого способа
 *  узнать, что канал мёртв. */
async function invalidateGuestCache(accountId: string, placeId: string): Promise<void> {
  try {
    const slug = await withAccount(accountId, async (c) =>
      (await c.query<{ slug: string }>('select slug from places where id = $1', [placeId])).rows[0]?.slug);
    if (!slug) return;
    await fetch(`${process.env.GUEST_INTERNAL_URL ?? 'http://guest:3000'}/internal/invalidate/${slug}`, {
      method: 'POST', signal: AbortSignal.timeout(2_000),
    });
  } catch (e) {
    console.error('guest_invalidate_failed', (e as Error).message);
  }
}
