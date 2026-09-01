// POST /api/feedback/private — единственный путь этого контейнера.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПОРЯДОК ШАГОВ ЗДЕСЬ — ЭТО И ЕСТЬ ЗАЩИТА. Что нельзя менять местами:
//
//  1. Origin — до всего. Форма, которую отдаём мы, всегда заставляет браузер прислать
//     заголовок, поэтому его ОТСУТСТВИЕ есть отказ, а не «старый клиент».
//  2. Грубый барьер — ДО ЧТЕНИЯ ТЕЛА и целиком в памяти. Оба порога заданы «на точку»,
//     а slug лежит В ТЕЛЕ: без этого шага перебор мусорными телами оплачивался бы нашим
//     чтением, а чтение тела — время, которым управляет КЛИЕНТ.
//  3. Чтение тела — с жёстким пределом и таймаутом, БЕЗ занятого соединения пула.
//  4. Пороги на точку — после резолва slug, но ДО валидации: иначе перебор невалидными
//     телами до счётчика не доходит и бесплатен.
//  5. Валидация — после лимита, до транзакции.
//  6. Транзакция — последней и короткой. Внешних вызовов внутри НЕТ.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { CoarseBarrier } from './barrier.js';
import { consume, LIMIT_IP_PLACE, LIMIT_PLACE, SCOPE_IP_PLACE, SCOPE_PLACE } from './limit.js';
import { validate, type Payload } from './validate.js';

export const barrier = new CoarseBarrier();
const MAX_BODY = 16 * 1024;
const BODY_TIMEOUT_MS = 5_000;
const ORIGIN = (process.env.BASE_URL ?? '').replace(/\/+$/, '');

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return raw?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

/** Чтение с ДВУМЯ пределами: по объёму и по времени. Время читает клиент, значит верхняя
 *  граница обязана быть нашей. Соединение пула при этом не занято. */
function readBody(req: IncomingMessage): Promise<string | { error: 413 | 408 }> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { req.destroy(); resolve({ error: 408 }); }, BODY_TIMEOUT_MS);
    req.on('data', (c: Buffer) => {
      size += c.length;
      // Соединение НЕ уничтожается: клиент обязан получить внятный ответ, а не обрыв.
      // Чтение прекращается паузой — байты дальше не принимаются, память не растёт.
      if (size > MAX_BODY) { clearTimeout(timer); req.pause(); resolve({ error: 413 }); return; }
      chunks.push(c);
    });
    req.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', () => { clearTimeout(timer); resolve({ error: 408 }); });
  });
}

export const server = createServer((req, res) => {
  void handle(req, res).catch(() => json(res, 500, { error: 'internal' }));
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0];
  if (req.method !== 'POST' || path !== '/api/feedback/private') return json(res, 404, { error: 'not_found' });

  // ── ШАГ 1. Origin. Отсутствие — отказ (fail-closed).
  if (ORIGIN && req.headers.origin !== ORIGIN) return json(res, 403, { error: 'forbidden' });

  // ── ШАГ 2. Грубый барьер. НИ ОДНОГО обращения к БД — ни на отказе, ни на пропуске.
  const ip = clientIp(req);
  if (!barrier.allow(ip)) {
    // Без счётчика и времени сброса в ответе: различимость — оракул перечисления.
    return json(res, 429, { error: 'too_many_requests' });
  }

  // ── ШАГ 3. Чтение тела.
  const raw = await readBody(req);
  if (typeof raw !== 'string') return json(res, raw.error, { error: raw.error === 413 ? 'body_too_large' : 'timeout' });

  let parsed: Payload;
  try { parsed = JSON.parse(raw) as Payload; } catch { return json(res, 422, { errors: ['тело: ожидается JSON'] }); }
  if (typeof parsed !== 'object' || parsed === null) return json(res, 422, { errors: ['тело: ожидается объект'] });

  const slug = typeof parsed.slug === 'string' ? parsed.slug.trim() : '';
  if (!slug) return json(res, 422, { errors: ['slug: обязателен'] });

  // ── ШАГ 4. Резолв точки и ОБА порога — ДО валидации.
  const { rows } = await pool.query<{ id: string }>(
    'select id from places where slug = $1 and archived_at is null', [slug]);
  const place = rows[0];
  if (!place) return json(res, 404, { error: 'not_found' });

  if (!(await consume(SCOPE_IP_PLACE, `${ip}|${place.id}`, LIMIT_IP_PLACE))) {
    return json(res, 429, { error: 'too_many_requests' });
  }
  if (!(await consume(SCOPE_PLACE, place.id, LIMIT_PLACE))) {
    return json(res, 429, { error: 'too_many_requests' });
  }

  // ── ШАГ 5. Валидация.
  const v = validate(parsed);
  if (!v.ok) return json(res, 422, { errors: v.errors });

  // ── ШАГ 6. Идентификатор порождает ПРИЛОЖЕНИЕ.
  // INSERT ... RETURNING невозможен: RETURNING требует SELECT-привилегии, которой у роли
  // нет по замыслу. Это не обход ограничения, а следствие того, что оно настоящее.
  const pfId = randomUUID();

  // ── ШАГ 7. ОДНА транзакция, обе вставки. Внешних вызовов внутри нет: недоступность
  // мессенджера обязана быть ЗАДЕРЖКОЙ, а не потерей отзыва.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'insert into private_feedback (id, place_id, body, rating, contact) values ($1,$2,$3,$4,$5)',
      [pfId, place.id, v.value.body, v.value.rating, v.value.contact]);
    // ON CONFLICT УБРАН НАМЕРЕННО, и это не упрощение.
    //
    // Обнаружение конфликта ЧИТАЕТ существующую строку, поэтому `ON CONFLICT` требует
    // привилегии SELECT — которой у роли приёма нет по замыслу. Архитектура предписывала
    // механизм, требующий права, которое она же и запрещает: каждый документ внутри себя
    // верен, вместе — permission denied. Найдено прогоном, чтением не ловилось.
    //
    // Право НЕ выдано, убран механизм: pfId порождается заново в этой же транзакции,
    // значит конфликт невозможен по построению. Уникальное ограничение остаётся
    // гарантией — но гарантией, которая при нарушении ОБЯЗАНА упасть, а не промолчать:
    // дубль здесь означал бы настоящий дефект, и глотать его нечем.
    await client.query(
      `insert into notifications (private_feedback_id, channel) values ($1,'telegram')`, [pfId]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return json(res, 201, { ok: true });
}
