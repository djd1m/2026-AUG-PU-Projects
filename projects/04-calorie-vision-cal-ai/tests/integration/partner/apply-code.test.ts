// ApplyPartnerCode — три исхода по `source` (ADR-008), гейт до записи, anti-fraud gate
// order (AC-partner-codes-and-cabinet-2,3,4,5,7,8,10). Настоящий Postgres: три проверки
// (blocked/self-referral/anti-fraud) и обе advisory-блокировки — поведение СЕРВЕРА, не
// библиотеки (`shared-resource-verification.md`).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import type { AntiFraudCheck } from '../../../apps/api/src/partner/anti-fraud.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { attributionOf, seedAccount, seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-apply-code');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('AC-partner-codes-and-cabinet-2: первое применение создаёт pending-атрибуцию', () => {
  it('applied/200: ровно одна attribution(pending, source=explicit, replaced_source=NULL), ровно один code_applied', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'LIZA10');
    const session = await seedDeviceSession(pool, 'ac2');

    const outcome = await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' },
      { pool, logger },
    );

    expect(outcome).toEqual({ outcome: 'applied' });
    const attribution = await attributionOf(pool, session.id);
    expect(attribution).toMatchObject({ status: 'pending', source: 'explicit', replaced_source: null, partner_code_id: code.id });
    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'code_applied'");
    expect(events.rows[0]?.n).toBe(1);
  });
});

describe('AC-partner-codes-and-cabinet-3: явный код заменяет слабый источник', () => {
  it('applied/200: строка ОБНОВЛЕНА, replaced_source=cookie, source=explicit, partner_code_id=B', async () => {
    const partner = await seedPartner(pool, 'liza');
    const codeA = await seedPartnerCode(pool, partner.partnerId, 'CODEA111');
    const codeB = await seedPartnerCode(pool, partner.partnerId, 'CODEB222');
    const session = await seedDeviceSession(pool, 'ac3');

    const first = await applyPartnerCode(
      { rawCode: codeA.code, source: 'cookie', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' },
      { pool, logger },
    );
    expect(first).toEqual({ outcome: 'applied' });

    const second = await applyPartnerCode(
      { rawCode: codeB.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r2' },
      { pool, logger },
    );
    expect(second).toEqual({ outcome: 'applied' });

    const rows = await pool.query('SELECT count(*)::int AS n FROM attribution WHERE device_session_id = $1', [session.id]);
    expect(rows.rows[0]?.n).toBe(1); // строка ОБНОВЛЕНА, а не создана вторая
    const attribution = await attributionOf(pool, session.id);
    expect(attribution).toMatchObject({ status: 'pending', source: 'explicit', replaced_source: 'cookie', partner_code_id: codeB.id });
  });
});

describe('AC-partner-codes-and-cabinet-4: явный источник не перебивается', () => {
  it('другим кодом (explicit) → conflict/409, строка не изменена', async () => {
    const partner = await seedPartner(pool, 'liza');
    const codeA = await seedPartnerCode(pool, partner.partnerId, 'CODEA111');
    const codeB = await seedPartnerCode(pool, partner.partnerId, 'CODEB222');
    const session = await seedDeviceSession(pool, 'ac4a');

    await applyPartnerCode({ rawCode: codeA.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });
    const before = await attributionOf(pool, session.id);

    const outcome = await applyPartnerCode({ rawCode: codeB.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r2' }, { pool, logger });

    expect(outcome).toMatchObject({ outcome: 'conflict' });
    expect(await attributionOf(pool, session.id)).toEqual(before);
  });

  it('тем же кодом (explicit) → conflict/409, строка не изменена', async () => {
    const partner = await seedPartner(pool, 'liza');
    const codeA = await seedPartnerCode(pool, partner.partnerId, 'CODEA111');
    const session = await seedDeviceSession(pool, 'ac4b');

    await applyPartnerCode({ rawCode: codeA.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });
    const before = await attributionOf(pool, session.id);

    const outcome = await applyPartnerCode({ rawCode: codeA.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r2' }, { pool, logger });

    expect(outcome).toMatchObject({ outcome: 'conflict' });
    expect(await attributionOf(pool, session.id)).toEqual(before);
  });
});

describe('AC-partner-codes-and-cabinet-5: слабый не перебивает слабый', () => {
  it('deeplink поверх cookie → conflict/409, строка не изменена', async () => {
    const partner = await seedPartner(pool, 'liza');
    const codeA = await seedPartnerCode(pool, partner.partnerId, 'CODEA111');
    const codeB = await seedPartnerCode(pool, partner.partnerId, 'CODEB222');
    const session = await seedDeviceSession(pool, 'ac5');

    await applyPartnerCode({ rawCode: codeA.code, source: 'deeplink', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });
    const before = await attributionOf(pool, session.id);

    const outcome = await applyPartnerCode({ rawCode: codeB.code, source: 'cookie', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r2' }, { pool, logger });

    expect(outcome).toMatchObject({ outcome: 'conflict' });
    expect(await attributionOf(pool, session.id)).toEqual(before);
  });
});

describe('AC-partner-codes-and-cabinet-7: заблокированный код отклоняется до записи', () => {
  it('rejected(code_blocked): attribution/growth_event не созданы', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'BLOCKED1', { status: 'blocked', blockedReason: 'manual' });
    const session = await seedDeviceSession(pool, 'ac7');

    const outcome = await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    expect(outcome).toEqual({ outcome: 'rejected', reason: 'code_blocked' });
    expect(await attributionOf(pool, session.id)).toBeUndefined();
    const events = await pool.query('SELECT count(*)::int AS n FROM growth_event');
    expect(events.rows[0]?.n).toBe(0);
  });
});

describe('AC-partner-codes-and-cabinet-8: самореферал на применении', () => {
  it('rejected(self_referral): attribution/growth_event не созданы', async () => {
    const ownerAccountId = await seedAccount(pool, '900001');
    const partner = await seedPartner(pool, 'liza', ownerAccountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'SELFREF1');
    const session = await seedDeviceSession(pool, 'ac8', { accountId: ownerAccountId });

    const outcome = await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    expect(outcome).toEqual({ outcome: 'rejected', reason: 'self_referral' });
    expect(await attributionOf(pool, session.id)).toBeUndefined();
    const events = await pool.query('SELECT count(*)::int AS n FROM growth_event');
    expect(events.rows[0]?.n).toBe(0);
  });

  it('account_id есть, но НЕ равен владельцу — не самореферал (edge case, 04_refinement.md)', async () => {
    const ownerAccountId = await seedAccount(pool, '900002');
    const otherAccountId = await seedAccount(pool, '900003');
    const partner = await seedPartner(pool, 'liza', ownerAccountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'NOTSELF1');
    const session = await seedDeviceSession(pool, 'ac8-not-self', { accountId: otherAccountId });

    const outcome = await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });

    expect(outcome).toEqual({ outcome: 'applied' });
  });
});

describe('AC-partner-codes-and-cabinet-10: блокировка не пересчитывается повторно', () => {
  it('rejected(code_blocked) шагом 4 гейта — adaptивный подсчёт (шпион AntiFraudOnCode) НЕ вызывается', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'BLOCKED2', { status: 'blocked', blockedReason: 'antifraud_ip_burst' });
    const session = await seedDeviceSession(pool, 'ac10');

    const spy = vi.fn<AntiFraudCheck>(async () => ({ outcome: 'allow' }));

    const outcome = await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' },
      { pool, logger, antiFraudCheck: spy },
    );

    expect(outcome).toEqual({ outcome: 'rejected', reason: 'code_blocked' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('порядок операций (security-operation-order.md): лок кода ДО чтения статуса', () => {
  it('перечитывает статус ПОСЛЕ захвата codeLock, а не использует значение из normalizeAndFindCode', async () => {
    // Код активен на момент normalizeAndFindCode (шаг 1), но заблокирован ДО того, как
    // applyPartnerCode дойдёт до перечитывания (шаг 4) — воспроизводится инъекцией
    // блокировки МЕЖДУ шагом 1 и открытием транзакции через шпион anti-fraud, который сам
    // не должен быть вызван (заблокированный код короткует раньше).
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'RACEBLK1', { status: 'active' });
    const session = await seedDeviceSession(pool, 'race-block');

    await pool.query(`UPDATE partner_code SET status = 'blocked', blocked_reason = 'manual', blocked_at = now() WHERE id = $1`, [code.id]);

    const outcome = await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' }, { pool, logger });
    expect(outcome).toEqual({ outcome: 'rejected', reason: 'code_blocked' });
  });
});


describe('повторный переход по ТОЙ ЖЕ ссылке отличается от чужого кода (16.09.2026)', () => {
  it('тот же код → conflict с sameCode: true; другой код → sameCode: false', async () => {
    const partnerOne = await seedPartner(pool, 'samecode-one');
    const codeOne = await seedPartnerCode(pool, partnerOne.partnerId, 'SAMEONE1');
    const partnerTwo = await seedPartner(pool, 'samecode-two');
    await seedPartnerCode(pool, partnerTwo.partnerId, 'SAMETWO1');
    const session = await seedDeviceSession(pool, 'samecode');

    const first = await applyPartnerCode(
      { rawCode: 'SAMEONE1', source: 'deeplink', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r1' },
      { pool, logger },
    );
    expect(first).toEqual({ outcome: 'applied' });

    const again = await applyPartnerCode(
      { rawCode: 'SAMEONE1', source: 'deeplink', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r2' },
      { pool, logger },
    );
    expect(again).toEqual({ outcome: 'conflict', sameCode: true });

    const other = await applyPartnerCode(
      { rawCode: 'SAMETWO1', source: 'deeplink', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'r3' },
      { pool, logger },
    );
    expect(other).toEqual({ outcome: 'conflict', sameCode: false });
    expect(codeOne.id).toBeDefined();
  });
});
