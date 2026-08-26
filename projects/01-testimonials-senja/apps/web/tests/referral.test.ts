// FR-GROWTH-002 — партнёрская атрибуция. Ошибка здесь стоит деньгами в обе стороны:
// недоначислили партнёру — он уйдёт; начислили за самого себя — платим за ничего.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { resolveAttribution, createPendingAttribution, convertAttributionOnPayment, REF_COOKIE } =
  await import('../src/lib/referral');

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

async function makePartner(
  c: PoolClient,
  opts: { rate?: number | null; ownerAccountId?: string | null; status?: string } = {},
): Promise<{ id: string; code: string }> {
  const code = `PARTNER-${uniq()}`;
  const { rows } = await c.query<{ id: string }>(
    `insert into partner_codes (code, partner_name, status, commission_rate, owner_account_id)
     values ($1, 'Партнёр', $2, $3, $4) returning id`,
    [code, opts.status ?? 'active', opts.rate === undefined ? 0.2 : opts.rate, opts.ownerAccountId ?? null],
  );
  return { id: rows[0]!.id, code };
}

async function makeAccount(c: PoolClient, email?: string): Promise<{ accountId: string; email: string }> {
  const addr = email ?? `ref${uniq()}@example.com`;
  const reg = await registerAccountAndProject(c, {
    email: addr, password: 'password-long-enough', desired_slug: `ref-${uniq()}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  return { accountId: reg.accountId, email: addr };
}

const attributionOf = async (c: PoolClient, id: string) =>
  (await c.query('select status, reason, source from referral_attributions where id = $1', [id])).rows[0];

afterAll(async () => {
  await closePool();
});

describe('ADR-003 — промокод приоритетнее cookie', () => {
  it('промокод побеждает, даже когда cookie от ДРУГОГО партнёра', async () => {
    await inRollback(async (c) => {
      const cookiePartner = await makePartner(c);
      const promoPartner = await makePartner(c);
      const a = await resolveAttribution(c, {
        promoCode: promoPartner.code,
        cookieRef: cookiePartner.code,
      });
      // Явное намерение пользователя побеждает пассивную метку.
      expect(a).toEqual({ source: 'promo_code', partnerCodeId: promoPartner.id });
    });
  });

  it('без промокода работает cookie', async () => {
    await inRollback(async (c) => {
      const p = await makePartner(c);
      expect(await resolveAttribution(c, { cookieRef: p.code })).toEqual({
        source: 'cookie', partnerCodeId: p.id,
      });
    });
  });

  it('НЕВАЛИДНЫЙ промокод не откатывается на cookie', async () => {
    await inRollback(async (c) => {
      const cookiePartner = await makePartner(c);
      // Молча засчитать другого партнёра значило бы подменить намерение пользователя.
      expect(await resolveAttribution(c, {
        promoCode: 'НЕТ-ТАКОГО-КОДА', cookieRef: cookiePartner.code,
      })).toBeNull();
    });
  });

  it('ОТОЗВАННЫЙ код не атрибуцирует ничего', async () => {
    await inRollback(async (c) => {
      const revoked = await makePartner(c, { status: 'revoked' });
      expect(await resolveAttribution(c, { promoCode: revoked.code })).toBeNull();
      expect(await resolveAttribution(c, { cookieRef: revoked.code })).toBeNull();
    });
  });

  it('отсутствие обеих меток — это нормальный путь, а не сбой', async () => {
    await inRollback(async (c) => {
      // Safari ITP укорачивает жизнь cookie примерно до 7 дней — приход без метки обычен.
      for (const input of [{}, { promoCode: '' }, { cookieRef: '  ' }, { promoCode: null, cookieRef: null }]) {
        expect(await resolveAttribution(c, input), JSON.stringify(input)).toBeNull();
      }
    });
  });

  it('имя cookie зафиксировано контрактом', () => {
    expect(REF_COOKIE).toBe('pw_ref');
  });
});

describe('атрибуция создаётся pending, начисление — по оплате', () => {
  it('регистрация с промокодом даёт pending, но НЕ комиссию', async () => {
    await inRollback(async (c) => {
      const partner = await makePartner(c);
      const acc = await makeAccount(c);
      const id = await createPendingAttribution(c, acc.accountId, {
        source: 'promo_code', partnerCodeId: partner.id,
      });
      expect(await attributionOf(c, id)).toMatchObject({ status: 'pending', source: 'promo_code' });
      // Выборка ТОЛЬКО по своей атрибуции: база общая, и тесты packages/db чистят
      // таблицы ПЕРЕД собой, оставляя за собой последнюю строку. Глобальный count(*)
      // здесь падал бы от чужих данных, а не от дефекта.
      const { rowCount } = await c.query(
        'select 1 from commissions where referral_attribution_id = $1', [id],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('оплата превращает pending в converted и создаёт начисление', async () => {
    await inRollback(async (c) => {
      const partner = await makePartner(c, { rate: 0.25 });
      const acc = await makeAccount(c);
      const attrId = await createPendingAttribution(c, acc.accountId, {
        source: 'cookie', partnerCodeId: partner.id,
      });

      const res = await convertAttributionOnPayment(c, acc.accountId, `evt-${uniq()}`, 1000);
      expect(res).toMatchObject({ outcome: 'converted', attributionId: attrId, rateMissing: false });
      expect(await attributionOf(c, attrId)).toMatchObject({ status: 'converted' });

      const { rows } = await c.query('select amount from commissions where referral_attribution_id = $1', [attrId]);
      expect(Number(rows[0].amount)).toBe(250); // 1000 × 0.25
    });
  });

  it('без атрибуции оплата проходит как обычная', async () => {
    await inRollback(async (c) => {
      const acc = await makeAccount(c);
      expect(await convertAttributionOnPayment(c, acc.accountId, `evt-${uniq()}`, 500)).toEqual({
        outcome: 'no_attribution',
      });
    });
  });

  it('[GAP] ставка не задана — атрибуция засчитана, начисление НЕ выдумано', async () => {
    await inRollback(async (c) => {
      const partner = await makePartner(c, { rate: null });
      const acc = await makeAccount(c);
      const attrId = await createPendingAttribution(c, acc.accountId, {
        source: 'promo_code', partnerCodeId: partner.id,
      });

      const res = await convertAttributionOnPayment(c, acc.accountId, `evt-${uniq()}`, 1000);
      // Ставка — коммерческое решение, не техническое. Выдумывать её нельзя,
      // но и терять факт «партнёр своё сделал» тоже.
      expect(res).toMatchObject({ outcome: 'converted', commissionId: null, rateMissing: true });
      expect(await attributionOf(c, attrId)).toMatchObject({ status: 'converted' });
      const { rowCount } = await c.query('select 1 from commissions where referral_attribution_id = $1', [attrId]);
      expect(rowCount).toBe(0);
    });
  });
});

describe('@security — self-referral не проходит', () => {
  it('партнёр платит по СВОЕМУ коду (по аккаунту) → комиссии нет', async () => {
    await inRollback(async (c) => {
      const owner = await makeAccount(c);
      const partner = await makePartner(c, { ownerAccountId: owner.accountId });
      const attrId = await createPendingAttribution(c, owner.accountId, {
        source: 'promo_code', partnerCodeId: partner.id,
      });

      const res = await convertAttributionOnPayment(c, owner.accountId, `evt-${uniq()}`, 1000);
      expect(res).toMatchObject({ outcome: 'self_referral', attributionId: attrId });
      expect(await attributionOf(c, attrId)).toMatchObject({ status: 'rejected', reason: 'self_referral' });

      const { rowCount } = await c.query(
        'select 1 from commissions where referral_attribution_id = $1', [attrId],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('попытка записана в audit_log с причиной self_referral', async () => {
    await inRollback(async (c) => {
      const owner = await makeAccount(c);
      const partner = await makePartner(c, { ownerAccountId: owner.accountId });
      await createPendingAttribution(c, owner.accountId, { source: 'cookie', partnerCodeId: partner.id });
      await convertAttributionOnPayment(c, owner.accountId, `evt-${uniq()}`, 1000);

      const { rows } = await c.query(
        "select action, reason, actor_id from audit_log where action = 'self_referral_blocked' and actor_id = $1",
        [owner.accountId],
      );
      expect(rows[0]).toMatchObject({ action: 'self_referral_blocked', reason: 'self_referral' });
    });
  });

  it('второй аккаунт на ТОТ ЖЕ email тоже ловится', async () => {
    await inRollback(async (c) => {
      const owner = await makeAccount(c);
      const partner = await makePartner(c, { ownerAccountId: owner.accountId });
      // Тот же ящик в другом регистре — обход «в лоб» не проходит.
      const { rows } = await c.query<{ id: string }>(
        'insert into accounts (email, password_hash) values ($1, $2) returning id',
        [owner.email.toUpperCase(), 'хеш'],
      );
      const twinId = rows[0]!.id;
      await createPendingAttribution(c, twinId, { source: 'promo_code', partnerCodeId: partner.id });

      expect(await convertAttributionOnPayment(c, twinId, `evt-${uniq()}`, 1000)).toMatchObject({
        outcome: 'self_referral',
      });
    });
  });

  it('ЧУЖОЙ плательщик по тому же коду начисление получает', async () => {
    await inRollback(async (c) => {
      const owner = await makeAccount(c);
      const partner = await makePartner(c, { ownerAccountId: owner.accountId, rate: 0.1 });
      const stranger = await makeAccount(c);
      const attrId = await createPendingAttribution(c, stranger.accountId, {
        source: 'promo_code', partnerCodeId: partner.id,
      });

      const res = await convertAttributionOnPayment(c, stranger.accountId, `evt-${uniq()}`, 2000);
      expect(res).toMatchObject({ outcome: 'converted', rateMissing: false });
      const { rows } = await c.query('select amount from commissions where referral_attribution_id = $1', [attrId]);
      expect(Number(rows[0].amount)).toBe(200);
    });
  });

  it('внешняя площадка без аккаунта: self-referral невозможен, начисление идёт', async () => {
    await inRollback(async (c) => {
      const partner = await makePartner(c, { ownerAccountId: null, rate: 0.15 });
      const payer = await makeAccount(c);
      await createPendingAttribution(c, payer.accountId, { source: 'cookie', partnerCodeId: partner.id });
      expect(await convertAttributionOnPayment(c, payer.accountId, `evt-${uniq()}`, 100)).toMatchObject({
        outcome: 'converted',
      });
    });
  });
});

describe('ADR-006 — начисление ровно один раз', () => {
  it('повтор с ТЕМ ЖЕ payment_event_id второго начисления не создаёт', async () => {
    await inRollback(async (c) => {
      const partner = await makePartner(c, { rate: 0.2 });
      const acc = await makeAccount(c);
      const attrId = await createPendingAttribution(c, acc.accountId, {
        source: 'promo_code', partnerCodeId: partner.id,
      });
      const eventId = `evt-dup-${uniq()}`;

      await convertAttributionOnPayment(c, acc.accountId, eventId, 1000);
      // Возвращаем в pending, чтобы вторая попытка дошла до вставки комиссии —
      // так проверяется именно защита СХЕМЫ, а не то, что до неё не дошли.
      await c.query("update referral_attributions set status = 'pending' where id = $1", [attrId]);
      await convertAttributionOnPayment(c, acc.accountId, eventId, 1000);

      const { rows } = await c.query(
        'select count(*)::int as n from commissions where payment_event_id = $1', [eventId],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});
