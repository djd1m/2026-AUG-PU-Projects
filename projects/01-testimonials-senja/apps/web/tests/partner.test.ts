// FR-GROWTH-004 — партнёрские коды, anti-fraud по IP, когортный дашборд.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { createPendingAttribution, convertAttributionOnPayment } = await import('../src/lib/referral');
const {
  generateCode, issuePartnerCode, revokePartnerCode, onSignupViaPartnerCode,
  getPartnerCohortDashboard, hashIp, FRAUD_THRESHOLD,
} = await import('../src/lib/partner');

async function inRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withService(async (client) => {
    const result = await fn(client);
    throw Object.assign(new Error('__rollback__'), { __result: result });
  }).catch((err: Error & { __result?: T }) => {
    if (err.message === '__rollback__') return err.__result as T;
    throw err;
  });
}

let n = 0;
const uniq = () => `${(n += 1)}-${Date.now().toString(36)}`;

async function makeAccount(c: PoolClient): Promise<string> {
  const reg = await registerAccountAndProject(c, {
    email: `pt${uniq()}@example.com`, password: 'password-long-enough', desired_slug: `pt-${uniq()}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  return reg.accountId;
}

afterAll(async () => {
  await closePool();
});

describe('generateCode — код диктуют голосом', () => {
  it('содержит узнаваемое имя партнёра', () => {
    expect(generateCode('Newsletter A').startsWith('NEWSLETTERA-')).toBe(true);
  });

  it('алфавит без похожих глифов: ни 0/O, ни 1/I', () => {
    for (let i = 0; i < 50; i += 1) {
      const suffix = generateCode('X').split('-')[1]!;
      expect(suffix, suffix).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    }
  });

  it('одно имя даёт РАЗНЫЕ коды — уникальность в суффиксе, не в имени', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode('Partner')));
    expect(codes.size).toBeGreaterThan(95);
  });

  it('имя из непечатаемых символов не ломает код', () => {
    for (const name of ['', '   ', '!!!', 'Партнёр', '🎉']) {
      expect(generateCode(name), name).toMatch(/^[A-Z0-9-]+$/);
    }
  });
});

describe('выдача и отзыв кода', () => {
  it('выданный код активен и попадает в аудит', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'Newsletter', { actorId: 'admin', commissionRate: 0.2 });
      const { rows } = await c.query('select status, commission_rate from partner_codes where id = $1', [id]);
      expect(rows[0].status).toBe('active');
      expect(Number(rows[0].commission_rate)).toBe(0.2);

      const audit = await c.query(
        "select action, reason from audit_log where entity_id = $1 and action = 'partner_code_issued'", [id],
      );
      expect(audit.rows[0]).toMatchObject({ reason: 'Newsletter' });
      expect(code).toContain('NEWSLETTER');
    });
  });

  it('отзыв делает код неактивным и фиксируется в аудите', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'Blog', { actorId: 'admin' });
      expect(await revokePartnerCode(c, code, 'admin')).toBe(true);
      const { rows } = await c.query('select status from partner_codes where id = $1', [id]);
      expect(rows[0].status).toBe('revoked');
      const audit = await c.query(
        "select 1 from audit_log where entity_id = $1 and action = 'partner_code_revoked'", [id],
      );
      expect(audit.rowCount).toBe(1);
    });
  });

  it('повторный отзыв — no-op, а не ошибка', async () => {
    await inRollback(async (c) => {
      const { code } = await issuePartnerCode(c, 'Twice', { actorId: 'admin' });
      expect(await revokePartnerCode(c, code, 'admin')).toBe(true);
      expect(await revokePartnerCode(c, code, 'admin')).toBe(false);
    });
  });

  it('отзыв НЕ откатывает уже начисленное — история immutable', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'History', { actorId: 'admin', commissionRate: 0.1 });
      const acc = await makeAccount(c);
      const attrId = await createPendingAttribution(c, acc, { source: 'promo_code', partnerCodeId: id });
      await convertAttributionOnPayment(c, acc, `evt-${uniq()}`, 1000);

      await revokePartnerCode(c, code, 'admin');

      const { rows } = await c.query(
        'select amount from commissions where referral_attribution_id = $1', [attrId],
      );
      expect(Number(rows[0].amount)).toBe(100); // начисление на месте
    });
  });
});

describe('@security — массовая накрутка регистраций с одного IP', () => {
  it(`до ${FRAUD_THRESHOLD} регистраций флага нет`, async () => {
    await inRollback(async (c) => {
      const acc = await makeAccount(c);
      const r = await onSignupViaPartnerCode(c, '10.0.0.1', acc, 'CODE');
      expect(r.flagged).toBe(false);
    });
  });

  it(`на ${FRAUD_THRESHOLD}-й — атрибуция блокируется, регистрация НЕТ`, async () => {
    await inRollback(async (c) => {
      const { id } = await issuePartnerCode(c, 'Fraud', { actorId: 'admin', commissionRate: 0.2 });
      const ip = '10.0.0.66';
      let last = { flagged: false, count: 0 };
      let lastAccount = '';
      let lastAttr = '';

      for (let i = 0; i < FRAUD_THRESHOLD; i += 1) {
        lastAccount = await makeAccount(c);
        lastAttr = await createPendingAttribution(c, lastAccount, { source: 'promo_code', partnerCodeId: id });
        last = await onSignupViaPartnerCode(c, ip, lastAccount, 'CODE');
      }

      expect(last.flagged).toBe(true);
      // Аккаунт на месте — за одним NAT могут сидеть живые люди.
      const acc = await c.query('select 1 from accounts where id = $1', [lastAccount]);
      expect(acc.rowCount).toBe(1);
      // А вот атрибуция заблокирована.
      const attr = await c.query('select status, reason from referral_attributions where id = $1', [lastAttr]);
      expect(attr.rows[0]).toMatchObject({ status: 'blocked', reason: 'suspected_fraud' });
    });
  });

  it('заблокированная атрибуция НЕ даёт начисления', async () => {
    await inRollback(async (c) => {
      const { id } = await issuePartnerCode(c, 'NoPay', { actorId: 'admin', commissionRate: 0.5 });
      const ip = '10.0.0.77';
      let account = '';
      for (let i = 0; i < FRAUD_THRESHOLD; i += 1) {
        account = await makeAccount(c);
        await createPendingAttribution(c, account, { source: 'promo_code', partnerCodeId: id });
        await onSignupViaPartnerCode(c, ip, account, 'CODE');
      }
      // Атрибуция в blocked — getPendingAttribution её не найдёт.
      expect(await convertAttributionOnPayment(c, account, `evt-${uniq()}`, 1000)).toEqual({
        outcome: 'no_attribution',
      });
    });
  });

  it('другой IP не наказан за чужую накрутку', async () => {
    await inRollback(async (c) => {
      for (let i = 0; i < FRAUD_THRESHOLD; i += 1) {
        await onSignupViaPartnerCode(c, '10.0.0.88', await makeAccount(c), 'CODE');
      }
      const clean = await onSignupViaPartnerCode(c, '10.0.0.99', await makeAccount(c), 'CODE');
      expect(clean.flagged).toBe(false);
    });
  });

  it('в audit_log попадает ХЕШ адреса, а не сам адрес', async () => {
    await inRollback(async (c) => {
      const ip = '203.0.113.42';
      let account = '';
      for (let i = 0; i < FRAUD_THRESHOLD; i += 1) {
        account = await makeAccount(c);
        await onSignupViaPartnerCode(c, ip, account, 'CODE');
      }
      const { rows } = await c.query(
        "select reason from audit_log where entity_id = $1 and action = 'suspected_fraud_flagged'", [account],
      );
      // audit_log живёт долго — сырой IP там персональные данные без нужды.
      expect(rows[0].reason).not.toContain(ip);
      expect(rows[0].reason).toContain(hashIp(ip));
    });
  });
});

describe('когортный дашборд (Pseudocode §10)', () => {
  it('считает регистрации, конверсии и сумму начислений', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'Cohort', { actorId: 'admin', commissionRate: 0.1 });
      // Три регистрации, из них одна оплатила.
      for (let i = 0; i < 3; i += 1) {
        const acc = await makeAccount(c);
        await createPendingAttribution(c, acc, { source: 'promo_code', partnerCodeId: id });
        if (i === 0) await convertAttributionOnPayment(c, acc, `evt-${uniq()}`, 1000);
      }

      const d = await getPartnerCohortDashboard(c, code);
      expect(d).toMatchObject({ partner_name: 'Cohort', code_status: 'active' });
      expect(d!.cohort.signups).toBe(3);
      expect(d!.cohort.conversions).toBe(1);
      expect(d!.cohort.conversion_rate).toBeCloseTo(1 / 3, 5);
      expect(d!.cohort.total_commission).toBe(100);
    });
  });

  it('БЕЗ регистраций conversion_rate = null, а не 0 — «нет данных» ≠ «0%»', async () => {
    await inRollback(async (c) => {
      const { code } = await issuePartnerCode(c, 'Empty', { actorId: 'admin' });
      const d = await getPartnerCohortDashboard(c, code);
      expect(d!.cohort.signups).toBe(0);
      expect(d!.cohort.conversion_rate).toBeNull();
      expect(d!.cohort.total_commission).toBe(0);
    });
  });

  it('регистрации есть, конверсий нет → 0, а не null', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'Zero', { actorId: 'admin' });
      await createPendingAttribution(c, await makeAccount(c), { source: 'cookie', partnerCodeId: id });
      const d = await getPartnerCohortDashboard(c, code);
      expect(d!.cohort.conversion_rate).toBe(0);
    });
  });

  it('несуществующий код → null (роут отдаст 404)', async () => {
    await inRollback(async (c) => {
      expect(await getPartnerCohortDashboard(c, 'НЕТ-ТАКОГО')).toBeNull();
    });
  });

  it('дашборд считает ВСЕ статусы в signups, включая заблокированные', async () => {
    await inRollback(async (c) => {
      const { id, code } = await issuePartnerCode(c, 'AllStatus', { actorId: 'admin' });
      for (const st of ['pending', 'converted', 'blocked', 'expired', 'rejected']) {
        const acc = await makeAccount(c);
        const aid = await createPendingAttribution(c, acc, { source: 'cookie', partnerCodeId: id });
        await c.query('update referral_attributions set status = $1 where id = $2', [st, aid]);
      }
      const d = await getPartnerCohortDashboard(c, code);
      expect(d!.cohort.signups).toBe(5);
      expect(d!.cohort.conversions).toBe(1);
    });
  });
});
