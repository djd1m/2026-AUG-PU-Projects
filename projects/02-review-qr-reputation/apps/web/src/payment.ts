// Оплата: создание платежа и вебхук ЮKassa.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПОРЯДОК В ВЕБХУКЕ — ЭТО И ЕСТЬ ЗАЩИТА (ADR-009; дефект проекта 01, где оплата
// «не применялась никогда»):
//   1) сеть источника → 2) ПОДЛИННОСТЬ перезапросом статуса у провайдера (ЮKassa
//   уведомления НЕ подписывает; HMAC был бы видимостью защиты) → 3) только после
//   этого — заявка идемпотентности и применение, одной транзакцией.
// Поменять 2 и 3 местами = подделка с угаданным id записывается первой, и настоящее
// уведомление отбрасывается как дубль.
// Недоступность провайдера — ИСКЛЮЧЕНИЕ, откатывающее транзакцию (HTTP 500 → повтор),
// а не значение: штатный возврат закоммитил бы заявку без применения.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

/** Подсети вебхуков ЮKassa — В КОДЕ, не в env: вынесенный список однажды приедет пустым,
 *  а пустой allowlist читается как «принимать отовсюду». Снято из документации ЮKassa,
 *  раздел «IP-адреса уведомлений», 2026-09. */
export const YOOKASSA_NETWORKS = [
  '185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25',
  '77.75.156.11/32', '77.75.156.35/32', '77.75.154.128/25',
] as const;

/** CIDR-проверка с уроком проекта 01: ПУСТАЯ МАСКА — ОПЕЧАТКА, а не /0.
 *  Number('') === 0, и '1.2.3.4/' превращался бы в «принимать любой адрес». */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  const ipN = ipv4ToInt(ip);
  if (ipN === null) return false;
  for (const cidr of cidrs) {
    const [net, prefixRaw] = cidr.split('/');
    if (prefixRaw === undefined || prefixRaw.trim() === '') return false;   // '1.2.3.4/' — отказ
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const netN = ipv4ToInt(net ?? '');
    if (netN === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    if (((ipN & mask) >>> 0) === ((netN & mask) >>> 0)) return true;
  }
  return false;
}
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** Цена — из конфига процесса. Из формы клиента НЕ принимается (AC-7).
 *  990 — гипотеза брифа, DEC-PAY-1; помечена и здесь, и в плане. */
export function pricePointRub(): number {
  const raw = process.env.PRICE_POINT_RUB;
  if (raw === undefined || raw === '') return 990;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`PRICE_POINT_RUB=${JSON.stringify(raw)} — целое положительное`);
  return n;
}

const YK_API = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 10_000;

function ykAuth(): string {
  const id = process.env.YOOKASSA_SHOP_ID ?? '';
  const key = process.env.YOOKASSA_SECRET_KEY ?? '';
  if (!id || !key) throw new PaymentNotConfigured();
  return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64');
}
export class PaymentNotConfigured extends Error {}
export class ProviderUnavailable extends Error {}

export async function createCheckout(accountId: string, fetchImpl: typeof fetch = fetch):
  Promise<{ url: string }> {
  const auth = ykAuth();   // отказ ДО сети и ДО записи: кнопка не должна вести в ошибку провайдера
  const price = pricePointRub();
  let resp: Response;
  try {
    resp = await fetchImpl(`${YK_API}/payments`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json',
        'idempotence-key': randomUUID() },   // повтор клика — один платёж, гарантирует провайдер
      body: JSON.stringify({
        amount: { value: `${price}.00`, currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: `${(process.env.BASE_URL ?? '').replace(/\/+$/, '')}/dashboard?paid=1` },
        description: 'ReviewQR · план «Точка», 30 дней',
        metadata: { account_id: accountId },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) { throw new ProviderUnavailable((e as Error).message); }
  if (!resp.ok) throw new ProviderUnavailable(`yookassa ${resp.status}`);
  const body = (await resp.json()) as { id?: string; confirmation?: { confirmation_url?: string } };
  if (!body.id || !body.confirmation?.confirmation_url) throw new ProviderUnavailable('нет confirmation_url');
  // Вставка ПОСЛЕ успешного создания у провайдера, вне долгих удержаний: сетевой вызов
  // выше не держит ни транзакции, ни соединения пула.
  await pool.query(
    `insert into checkout_sessions (account_id, provider_session_id) values ($1, $2)`,
    [accountId, body.id]);
  return { url: body.confirmation.confirmation_url };
}

interface YkEvent { event?: string; object?: { id?: string; status?: string } }

export async function handleYookassaWebhook(rawBody: string, ip: string, fetchImpl: typeof fetch = fetch):
  Promise<{ code: number; slugsToInvalidate: string[] }> {
  // ── ШАГ 1. Сеть источника.
  if (!ipInAnyCidr(ip, YOOKASSA_NETWORKS)) return { code: 400, slugsToInvalidate: [] };

  let ev: YkEvent;
  try { ev = JSON.parse(rawBody) as YkEvent; } catch { return { code: 400, slugsToInvalidate: [] }; }
  const objectId = ev.object?.id ?? '';
  const eventType = ev.event ?? '';
  if (!objectId || !/^payment\.(succeeded|canceled)$/.test(eventType)) return { code: 200, slugsToInvalidate: [] };

  // ── ШАГ 2. ПОДЛИННОСТЬ: перезапрос статуса. ВНЕ транзакции. Недоступность БРОСАЕТ.
  let remoteStatus: string;
  try {
    const r = await fetchImpl(`${YK_API}/payments/${objectId}`, {
      headers: { authorization: ykAuth() }, signal: AbortSignal.timeout(5_000) });
    if (r.status === 404) return { code: 200, slugsToInvalidate: [] };   // такого платежа НЕТ — подделка, игнор
    if (!r.ok) throw new ProviderUnavailable(`status ${r.status}`);
    remoteStatus = ((await r.json()) as { status?: string }).status ?? '';
  } catch (e) {
    if (e instanceof PaymentNotConfigured) throw e;
    throw new ProviderUnavailable((e as Error).message);   // → 500 → провайдер повторит
  }
  const claimedStatus = eventType === 'payment.succeeded' ? 'succeeded' : 'canceled';
  if (remoteStatus !== claimedStatus) return { code: 200, slugsToInvalidate: [] };   // событие врёт — игнор

  // ── ШАГ 3. Одна транзакция: заявка идемпотентности + применение.
  const client = await pool.connect();
  const slugs: string[] = [];
  try {
    await client.query('begin');
    const eventKey = `${eventType}:${objectId}`;   // голый id схлопнул бы succeeded и canceled
    const claimed = await client.query(
      `insert into webhook_events (provider, event_id, payload) values ('yookassa', $1, $2)
       on conflict (provider, event_id) do nothing returning event_id`,
      // JSON.stringify(ev), НЕ rawBody.slice(N): обрезка сырого текста ломала бы jsonb
      [eventKey, JSON.stringify(ev)]);
    if (!claimed.rows[0]) { await client.query('commit'); return { code: 200, slugsToInvalidate: [] }; }   // дубль

    if (claimedStatus === 'succeeded') {
      const cs = await client.query<{ account_id: string }>(
        `select account_id from checkout_sessions where provider_session_id = $1`, [objectId]);
      const accountId = cs.rows[0]?.account_id;
      if (accountId) {
        // Контекст арендатора — ИЗ НАШЕЙ строки, никогда из тела вебхука.
        await client.query("select set_config('app.current_account_id', $1, true)", [accountId]);
        await client.query(`update checkout_sessions set status='completed' where provider_session_id=$1`, [objectId]);
        await client.query(
          `insert into subscriptions (account_id, plan, places_limit, current_period_end, status)
           values ($1, 'point', 1, now() + interval '30 days', 'active')
           on conflict (account_id) where status = 'active'
           do update set current_period_end = subscriptions.current_period_end + interval '30 days'`,
          [accountId]);
        const upd = await client.query<{ slug: string }>(
          `update places set branding_required = false where account_id = $1 returning slug`, [accountId]);
        slugs.push(...upd.rows.map((r) => r.slug));
        // Комиссия партнёру: одна на платёж (uq_commissions_payment_event — вторая,
        // НЕЗАВИСИМАЯ гарантия поверх идемпотентности вебхука).
        await client.query(
          `insert into commissions (attribution_id, payment_event_id, amount)
           select a.id, $2, $3 * p.payout_rate
             from attributions a join partners p on p.id = a.partner_id
            where a.account_id = $1 and a.status = 'pending' and a.expires_at > now()
              and p.status = 'active'
            limit 1
           on conflict (payment_event_id) do nothing`,
          [accountId, eventKey, pricePointRub()]);
        await client.query(
          `update attributions set status='converted' where account_id=$1 and status='pending'`, [accountId]);
      }
    } else {
      // canceled: НЕ затирает применённый тариф — только помечает незавершённый checkout.
      await client.query(
        `update checkout_sessions set status='expired' where provider_session_id=$1 and status='pending'`, [objectId]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  // Инвалидация — ПОСЛЕ COMMIT: сброс изнутри транзакции закэшировал бы состояние,
  // ещё не видимое другим соединениям.
  return { code: 200, slugsToInvalidate: slugs };
}
