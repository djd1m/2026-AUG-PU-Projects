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
import { buildDoors, notFoundHtml, privateFormHtml, privateSentHtml, template,
  type LinkRow, type PlaceRow } from './render.js';
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

const INTAKE_URL = process.env.INTAKE_URL ?? 'http://intake:3000';
const MAX_FORM = 16 * 1024;

/** Чтение формы с пределом. Ответ отдаётся, соединение не рвётся. */
function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const t = setTimeout(() => { req.pause(); resolve(null); }, 5_000);
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_FORM) { clearTimeout(t); req.pause(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => { clearTimeout(t); resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))); });
    req.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

/** Внешний вызов ВНЕ транзакции — её здесь и нет: у рендера нет прав на запись.
 *  Таймаут обязателен: время ответа соседнего контейнера нам не принадлежит. */
async function postToIntake(slug: string, form: URLSearchParams): Promise<{ ok: boolean; status: number; message: string }> {
  const ratingRaw = form.get('rating');
  const payload = {
    slug,
    body: form.get('body') ?? '',
    rating: ratingRaw ? Number(ratingRaw) : undefined,
    contact: form.get('contact') || undefined,
  };
  try {
    const r = await fetch(`${INTAKE_URL}/api/feedback/private`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (r.status === 201) return { ok: true, status: 201, message: '' };
    const b = (await r.json().catch(() => ({}))) as { errors?: string[] };
    const msg = r.status === 429
      ? 'Слишком много сообщений с этого адреса. Попробуйте позже.'
      : (b.errors?.join('; ') ?? 'Не удалось отправить. Попробуйте ещё раз.');
    return { ok: false, status: r.status === 429 ? 429 : 422, message: msg };
  } catch {
    // Недоступность соседа — ОТКАЗ с внятным текстом, а не тихое «отправлено».
    return { ok: false, status: 503, message: 'Сервис временно недоступен. Попробуйте через минуту.' };
  }
}

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

  // ── ФОРМА ПРИВАТНОГО ОБРАЩЕНИЯ. Отдельный документ — вынужденно: страж запрещает
  // виджет оценки на странице ВЫБОРА, а внутри уже выбранной формы оценка законна,
  // и раскрыть форму на месте нечем, потому что страница без JS.
  if (seg[0] === 'r' && seg[1] && seg[2] === 'private' && seg.length === 3) {
    const place = await selectPlace(seg[1]);
    if (!place) { res.writeHead(404, html); res.end(notFoundHtml()); return; }

    if (req.method === 'POST') {
      const form = await readForm(req);
      if (form === null) { res.writeHead(413, html); res.end(privateFormHtml(place.name, seg[1], BASE_URL, 'Слишком длинное сообщение')); return; }

      // ОТПРАВКА ИДЁТ В КОНТЕЙНЕР ПРИЁМА, а не пишется здесь. У роли рендера нет и не
      // может быть права записи в приватные обращения — граница проходит по контейнеру,
      // и обойти её изнутри этого процесса физически нечем.
      const r = await postToIntake(seg[1], form);
      if (r.ok) {
        recordGuestEvent(place.id, 'private_door_click', null, clientIp(req), String(req.headers['user-agent'] ?? ''));
        res.writeHead(200, html); res.end(privateSentHtml(place.name, seg[1], BASE_URL)); return;
      }
      res.writeHead(r.status, html);
      res.end(privateFormHtml(place.name, seg[1], BASE_URL, r.message));
      return;
    }

    res.writeHead(200, html);
    res.end(privateFormHtml(place.name, seg[1], BASE_URL));
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
