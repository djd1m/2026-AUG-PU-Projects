// packages/db/tests/idempotency.test.ts
//
// Источник: docs/ADR.md ADR-006 (идемпотентность обработки платёжных вебхуков — UNIQUE constraint
// на уровне схемы БД, "не проверка SELECT перед INSERT в commissions"), docs/Architecture.md §3
// (webhook_events(provider, event_id UNIQUE), commissions(payment_event_id UNIQUE)).
//
// Тест-контракт ADR-006, буквально: "интеграционный тест отправляет один и тот же payload дважды
// подряд, ожидает ровно одну строку в commissions."

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminPool, closeAdminPool, seedAccountWithProject, truncateAll } from './setup';

afterAll(async () => {
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
});

/** insert-based дедупликация ровно как описано в ADR-006: INSERT конфликтует ⇒ уже обработано. */
async function tryRecordWebhookEvent(provider: string, eventId: string): Promise<boolean> {
  const { rows } = await adminPool.query(
    `insert into webhook_events (provider, event_id) values ($1, $2)
     on conflict (provider, event_id) do nothing
     returning id`,
    [provider, eventId],
  );
  return rows.length > 0; // true ⇒ первая доставка, обрабатываем; false ⇒ дубль, no-op
}

describe('идемпотентность: webhook_events.event_id (ADR-006)', () => {
  it('повторный event_id того же provider не проходит дважды', async () => {
    const first = await tryRecordWebhookEvent('stripe-like', 'evt_123');
    const second = await tryRecordWebhookEvent('stripe-like', 'evt_123');

    expect(first).toBe(true);
    expect(second).toBe(false);

    const { rows } = await adminPool.query(
      'select count(*)::int as n from webhook_events where provider = $1 and event_id = $2',
      ['stripe-like', 'evt_123'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('одинаковый event_id у РАЗНЫХ провайдеров — не конфликт (unique составной)', async () => {
    const a = await tryRecordWebhookEvent('provider-a', 'evt_shared');
    const b = await tryRecordWebhookEvent('provider-b', 'evt_shared');

    expect(a).toBe(true);
    expect(b).toBe(true);
  });
});

describe('идемпотентность: commissions.payment_event_id (ADR-006, вторая независимая гарантия)', () => {
  it('один и тот же payment_event_id дважды подряд — ровно одна строка в commissions', async () => {
    const { accountId } = await seedAccountWithProject();
    const { rows: partnerRows } = await adminPool.query<{ id: string }>(
      `insert into partner_codes (code, partner_name) values ('PARTNER-XXXX', 'Acme Partner') returning id`,
    );
    const partnerCodeId = partnerRows[0]!.id;
    const { rows: attrRows } = await adminPool.query<{ id: string }>(
      `insert into referral_attributions (account_id, partner_code_id, source, status)
       values ($1, $2, 'promo_code', 'pending') returning id`,
      [accountId, partnerCodeId],
    );
    const attributionId = attrRows[0]!.id;

    async function tryRecordCommission() {
      const { rows } = await adminPool.query(
        `insert into commissions (referral_attribution_id, payment_event_id, amount)
         values ($1, 'evt_pay_1', 10.00)
         on conflict (payment_event_id) do nothing
         returning id`,
        [attributionId],
      );
      return rows.length > 0;
    }

    const first = await tryRecordCommission();
    const second = await tryRecordCommission(); // "тот же вебхук оплаты приходит повторно"

    expect(first).toBe(true);
    expect(second).toBe(false);

    const { rows } = await adminPool.query(
      'select count(*)::int as n from commissions where payment_event_id = $1',
      ['evt_pay_1'],
    );
    expect(rows[0].n).toBe(1);
  });
});
