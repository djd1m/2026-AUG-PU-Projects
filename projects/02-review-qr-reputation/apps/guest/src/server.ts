// Гостевой контейнер: ровно три публичных пути и ни одного больше.
//
//   GET /r/:slug                — страница выбора
//   GET /r/:slug/private        — форма приватного обращения
//   GET /go/:slug/:platform     — измеримый переход на площадку
//
// Четвёртый — POST /api/feedback/private — живёт в ДРУГОМ контейнере, под другой ролью
// СУБД. Разделение не архитектурное украшение: у приёма есть INSERT на приватные
// обращения, у рендера его нет и быть не может.
//
// РОУТА, ПРИНИМАЮЩЕГО ОЦЕНКУ И ВОЗВРАЩАЮЩЕГО НАПРАВЛЕНИЕ, НЕ СУЩЕСТВУЕТ. Это и есть
// инвариант — не «путей ровно три». Список меняется вместе с архитектурой, запрет нет.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pool } from './db.js';
import { buildDoors, notFoundHtml, template, type LinkRow, type PlaceRow } from './render.js';
import { isPlatform, resolvePlatformUrl } from './resolve.js';
import { recordGuestEvent } from './journal.js';

const BASE_URL = requireBaseUrl();

/** Внешний адрес БЕЗ ПРАВА НА ДЕФОЛТ в проде: он определяет каждый QR-код и каждую
 *  выданную ссылку. Тихий дефолт отправил бы весь тираж наклеек на localhost, и узнали
 *  бы мы об этом от заведения, а не из проверки. Урок соседнего проекта. */
function requireBaseUrl(): string {
  const v = process.env.BASE_URL;
  if (v && v.trim() !== '') return v.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BASE_URL не задан. Он определяет КАЖДЫЙ печатаемый QR-код.');
  }
  return 'http://localhost:3000';
}

const CACHE_TTL_MS = 60_000; // ≤ 60 c — страховка на случай отказа явной инвалидации
const cache = new Map<string, { html: string; at: number }>();

export function invalidateChoicePage(slug: string): void {
  cache.delete(slug);
}

/** ЧИСТАЯ ФУНКЦИЯ ОТ SLUG. Другого аргумента нет и взять его неоткуда. */
export async function renderChoicePage(slug: string): Promise<{ html: string; place: PlaceRow | null }> {
  const place = await selectPlace(slug);
  if (!place) return { html: notFoundHtml(), place: null };

  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { html: hit.html, place };

  const { rows: links } = await pool.query<LinkRow>(
    'select platform, url, link_kind from platform_links where place_id = $1',
    [place.id],
  );
  const html = template(place.name, buildDoors(slug, links, BASE_URL), place.branding_required);
  cache.set(slug, { html, at: Date.now() });
  return { html, place };
}

async function selectPlace(slug: string): Promise<PlaceRow | null> {
  const { rows } = await pool.query<PlaceRow>(
    'select id, slug, name, branding_required from places where slug = $1 and archived_at is null',
    [slug],
  );
  return rows[0] ?? null;
}

function clientIp(req: IncomingMessage): string {
  // За прокси берётся ПЕРВЫЙ элемент: последний дописывает сам прокси, и код, доверяющий
  // ему, при прямом доступе получил бы значение от клиента.
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return raw?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

export const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void handle(req, res).catch(() => {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('error');
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Путь берётся ДО '?'. Строка запроса не разбирается вообще: ветвить по ?rating нечем.
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const seg = path.split('/').filter(Boolean);
  const html = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };

  if (seg[0] === 'r' && seg[1] && seg.length === 2) {
    const { html: body, place } = await renderChoicePage(seg[1]);
    if (place) recordGuestEvent(place.id, 'scan', null, clientIp(req), String(req.headers['user-agent'] ?? ''));
    res.writeHead(place ? 200 : 404, html);
    res.end(body);
    return;
  }

  if (seg[0] === 'go' && seg[1] && seg[2] && seg.length === 3 && isPlatform(seg[2])) {
    const url = await resolvePlatformUrl(seg[1], seg[2]);
    if (!url) { res.writeHead(404, html); res.end(notFoundHtml()); return; }
    const place = await selectPlace(seg[1]);
    if (place) recordGuestEvent(place.id, 'public_door_click', seg[2], clientIp(req), String(req.headers['user-agent'] ?? ''));
    // Location зависит ТОЛЬКО от пары (slug, platform). Аналитика выше — «отправил и
    // забыл»: её отказ не меняет ни Location, ни код ответа.
    res.writeHead(302, { location: url, 'cache-control': 'no-store' });
    res.end();
    return;
  }

  res.writeHead(404, html);
  res.end(notFoundHtml());
}
