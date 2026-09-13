// ActivateAttributionOnRecognition (AC-partner-codes-and-cabinet-12/13/14). Вызывается
// напрямую с открытым клиентом транзакции — контракт места вызова из `03_architecture.md`
// («принимает уже открытый клиент транзакции, не пул»); интеграция с `source-and-correct`
// остаётся именованным TODO (тот путь ещё не написан в этом worktree).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction, type DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import { activateAttributionOnRecognition } from '../../../apps/api/src/partner/activate-attribution.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { attributionOf, seedAccount, seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-activate-attribution');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('AC-partner-codes-and-cabinet-12: первый успех активирует, второй — no-op', () => {
  it('после первого: activated, activated_at установлен, ровно одна growth_event(activation); после второго — без изменений', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'ACTIVA11');
    const session = await seedDeviceSession(pool, 'ac12');
    await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    const first = await withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id));
    expect(first).toEqual({ outcome: 'activated' });

    const afterFirst = await attributionOf(pool, session.id);
    expect(afterFirst?.status).toBe('activated');
    expect(afterFirst?.activated_at).not.toBeNull();
    const activatedAt = afterFirst?.activated_at;

    const eventsAfterFirst = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(eventsAfterFirst.rows[0]?.n).toBe(1);

    const second = await withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id));
    expect(second).toEqual({ outcome: 'already_settled' });

    const afterSecond = await attributionOf(pool, session.id);
    expect(afterSecond?.activated_at).toEqual(activatedAt);
    const eventsAfterSecond = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(eventsAfterSecond.rows[0]?.n).toBe(1);
  });

  it('сессия без pending-атрибуции (обычный пользователь без кода) — no_attribution, no-op', async () => {
    const session = await seedDeviceSession(pool, 'no-code');
    const outcome = await withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id));
    expect(outcome).toEqual({ outcome: 'no_attribution' });
  });
});

describe('AC-partner-codes-and-cabinet-13: код заблокирован между применением и распознаванием', () => {
  it('rejected(code_blocked): activated_at остаётся NULL, growth_event(activation) не создан', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'BLKAFTR1');
    const session = await seedDeviceSession(pool, 'ac13');
    await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    // Код блокируется ПОСЛЕ создания pending-атрибуции (другой сессией/anti-fraud).
    await pool.query(`UPDATE partner_code SET status = 'blocked', blocked_reason = 'antifraud_ip_burst', blocked_at = now() WHERE id = $1`, [code.id]);

    const outcome = await withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id));
    expect(outcome).toEqual({ outcome: 'rejected', reason: 'code_blocked' });

    const attribution = await attributionOf(pool, session.id);
    expect(attribution).toMatchObject({ status: 'rejected', reject_reason: 'code_blocked' });
    expect(attribution?.activated_at).toBeNull();
    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation'");
    expect(events.rows[0]?.n).toBe(0);

    // Follow-up FU-partner-codes-and-cabinet-1: значение reject_reason ВСЕГДА code_blocked
    // здесь, даже если исходная причина блокировки была antifraud_ip_burst.
  });
});

describe('AC-partner-codes-and-cabinet-14: самореферал, обнаруженный после входа через Telegram', () => {
  it('rejected(self_referral): pending создана анонимной сессией, затем account_id совпал с владельцем кода', async () => {
    const ownerAccountId = await seedAccount(pool, '900010');
    const partner = await seedPartner(pool, 'liza', ownerAccountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'SELFAFT1');
    const session = await seedDeviceSession(pool, 'ac14'); // account_id = NULL на момент применения
    await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    // "Вход через Telegram" — эта фича ЧИТАЕТ account_id, не пишет; здесь оно проставляется
    // напрямую, как это сделала бы `consent-and-telegram-auth`.
    await pool.query('UPDATE device_session SET account_id = $1 WHERE id = $2', [ownerAccountId, session.id]);

    const outcome = await withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id));
    expect(outcome).toEqual({ outcome: 'rejected', reason: 'self_referral' });

    const attribution = await attributionOf(pool, session.id);
    expect(attribution).toMatchObject({ status: 'rejected', reject_reason: 'self_referral' });
    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation'");
    expect(events.rows[0]?.n).toBe(0);
  });
});
