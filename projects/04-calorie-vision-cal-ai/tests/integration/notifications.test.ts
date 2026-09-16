// Пункт 4: уведомления партнёру. Проверяется ГЛАВНОЕ свойство — строка в базе появляется
// вместе с деньгами и не зависит ни от какой внешней доставки (DEC-A-059).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createFakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { SESSION_COOKIE_NAME, generateSessionToken, hashSessionToken } from '../../apps/api/src/session/create-device-session.js';
import { deliverNotification, notifyPartner, type TelegramSender } from '../../apps/api/src/notifications/notify.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';

let pool: DbPool;
let app: FastifyInstance;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-notifications');
  app = buildServer({ config: testScanApiConfig(), pool, logger, payments: createFakePaymentProvider() });
  await app.ready();
}, 60_000);
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

async function partnerWithAccount(telegramUserId: string | null): Promise<{ partnerId: string; accountId: string; token: string }> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    telegramUserId === null ? [null, 'p@example.com', 'x'] : [telegramUserId, null, null],
  );
  const accountId = account.rows[0]!.id;
  const partner = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact, account_id) VALUES ('Блогер', '@b', $1) RETURNING id`,
    [accountId],
  );
  const token = generateSessionToken();
  await pool.query(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, account_id, anonymous_diary_expires_at)
     VALUES ($1, '203.0.113.0/24', $2, now() + interval '7 days')`,
    [hashSessionToken(token), accountId],
  );
  return { partnerId: partner.rows[0]!.id, accountId, token };
}

describe('строка уведомления — источник истины', () => {
  it('партнёр видит непрочитанное; после пометки список пуст, а сама запись не удалена', async () => {
    const { partnerId, token } = await partnerWithAccount(null);
    await notifyPartner(pool, { partnerId, kind: 'commission_accrued', amountMinor: 47_865 });

    const before = await app.inject({ method: 'GET', url: '/api/v1/notifications', cookies: { [SESSION_COOKIE_NAME]: token } });
    const items = JSON.parse(before.body).data.items;
    expect(items).toHaveLength(1);
    expect(items[0].text).toContain('478,65');

    expect((await app.inject({ method: 'POST', url: '/api/v1/notifications/read', cookies: { [SESSION_COOKIE_NAME]: token } })).statusCode).toBe(200);
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/notifications', cookies: { [SESSION_COOKIE_NAME]: token } })).body).data.items).toHaveLength(0);
    // История денег не трогается пометкой: строка на месте, просто прочитана.
    expect((await pool.query(`SELECT 1 FROM notification WHERE read_at IS NOT NULL`)).rows).toHaveLength(1);
  });

  it('партнёр БЕЗ аккаунта (приглашение не принято) уведомления не получает — адресата нет, и это не ошибка', async () => {
    const partner = await pool.query<{ id: string }>(`INSERT INTO partner (display_name, contact) VALUES ('Без аккаунта', '@x') RETURNING id`);
    const id = await notifyPartner(pool, { partnerId: partner.rows[0]!.id, kind: 'commission_accrued', amountMinor: 100 });
    expect(id).toBeNull();
    expect((await pool.query(`SELECT 1 FROM notification`)).rows).toHaveLength(0);
  });

  it('анонимная сессия получает ПУСТОЙ список, а не отказ: кабинет зовёт этот маршрут до входа', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toEqual({ unread: 0, items: [] });
  });

  it('чужие уведомления не видны и не помечаются', async () => {
    const mine = await partnerWithAccount(null);
    const otherAccount = await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash) VALUES ('o@example.com','x') RETURNING id`);
    const otherPartner = await pool.query<{ id: string }>(`INSERT INTO partner (display_name, contact, account_id) VALUES ('Чужой','@o',$1) RETURNING id`, [otherAccount.rows[0]!.id]);
    await notifyPartner(pool, { partnerId: otherPartner.rows[0]!.id, kind: 'payout_recorded', amountMinor: 999 });

    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/notifications', cookies: { [SESSION_COOKIE_NAME]: mine.token } })).body).data.items).toHaveLength(0);
    await app.inject({ method: 'POST', url: '/api/v1/notifications/read', cookies: { [SESSION_COOKIE_NAME]: mine.token } });
    expect((await pool.query(`SELECT 1 FROM notification WHERE read_at IS NULL`)).rows).toHaveLength(1);
  });
});

describe('доставка наружу — НАДСТРОЙКА, её отказ не теряет уведомление', () => {
  it('успех: delivered_at проставлен, ошибка очищена', async () => {
    const { partnerId } = await partnerWithAccount('777000111');
    const id = (await notifyPartner(pool, { partnerId, kind: 'commission_accrued', amountMinor: 1000 }))!;
    const sent: string[] = [];
    const sender: TelegramSender = { send: async (chatId, text) => { sent.push(`${chatId}:${text}`); } };
    await deliverNotification(pool, { sender, logger }, id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('777000111');
    const row = await pool.query<{ delivered_at: Date | null; delivery_error: string | null }>(`SELECT delivered_at, delivery_error FROM notification WHERE id = $1`, [id]);
    expect(row.rows[0]!.delivered_at).not.toBeNull();
    expect(row.rows[0]!.delivery_error).toBeNull();
  });

  it('отказ Telegram: причина записана, уведомление ОСТАЛОСЬ непрочитанным и видимым', async () => {
    const { partnerId, token } = await partnerWithAccount('777000222');
    const id = (await notifyPartner(pool, { partnerId, kind: 'commission_accrued', amountMinor: 1000 }))!;
    const sender: TelegramSender = { send: async () => { throw new Error('Forbidden: bot cannot initiate conversation'); } };
    await deliverNotification(pool, { sender, logger }, id);
    const row = await pool.query<{ delivered_at: Date | null; delivery_error: string | null }>(`SELECT delivered_at, delivery_error FROM notification WHERE id = $1`, [id]);
    expect(row.rows[0]!.delivered_at).toBeNull();
    expect(row.rows[0]!.delivery_error).toContain('Forbidden');
    // Главное: в кабинете оно ВИДНО — доставка не состоялась, уведомление не потеряно.
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/notifications', cookies: { [SESSION_COOKIE_NAME]: token } })).body).data.items).toHaveLength(1);
  });

  it('аккаунт без Telegram: причина названа отдельно, без обращения к сети', async () => {
    const { partnerId } = await partnerWithAccount(null);
    const id = (await notifyPartner(pool, { partnerId, kind: 'payout_recorded', amountMinor: 500 }))!;
    let called = false;
    await deliverNotification(pool, { sender: { send: async () => { called = true; } }, logger }, id);
    expect(called).toBe(false);
    const row = await pool.query<{ delivery_error: string | null }>(`SELECT delivery_error FROM notification WHERE id = $1`, [id]);
    expect(row.rows[0]!.delivery_error).toBe('telegram_not_linked');
  });
});

describe('реквизиты выплаты и реестр (пункт 3, частично)', () => {
  it('партнёр задаёт СБП: телефон нормализуется, наружу отдаётся МАСКА, а не номер', async () => {
    const { token } = await partnerWithAccount(null);
    const saved = await app.inject({
      method: 'PUT', url: '/api/v1/partner/payout-details',
      payload: { method: 'sbp', phone: '8 (999) 123-45-67', bank: 'Т-Банк' },
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(saved.statusCode).toBe(200);
    const data = JSON.parse(saved.body).data;
    expect(data.phone_masked).not.toContain('9991234');
    // В базе — канонический вид, чтобы реестр был пригоден для перевода.
    const row = await pool.query<{ payout_phone: string }>(`SELECT payout_phone FROM partner WHERE payout_phone IS NOT NULL`);
    expect(row.rows[0]!.payout_phone).toBe('+79991234567');
  });

  it('номер карты отвергается маршрутом, а не только формой', async () => {
    const { token } = await partnerWithAccount(null);
    const response = await app.inject({
      method: 'PUT', url: '/api/v1/partner/payout-details',
      payload: { method: 'other', note: 'карта 4111 1111 1111 1111' },
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe('card_number_refused');
    expect((await pool.query(`SELECT 1 FROM partner WHERE payout_note IS NOT NULL`)).rows).toHaveLength(0);
  });

  it('не партнёр реквизиты не задаёт — 403', async () => {
    const account = await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash) VALUES ('nobody@example.com','x') RETURNING id`);
    const token = generateSessionToken();
    await pool.query(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, account_id, anonymous_diary_expires_at) VALUES ($1,'203.0.113.0/24',$2, now() + interval '7 days')`,
      [hashSessionToken(token), account.rows[0]!.id],
    );
    expect((await app.inject({ method: 'PUT', url: '/api/v1/partner/payout-details', payload: { method: 'sbp', phone: '+79991234567' }, cookies: { [SESSION_COOKIE_NAME]: token } })).statusCode).toBe(403);
  });
});
