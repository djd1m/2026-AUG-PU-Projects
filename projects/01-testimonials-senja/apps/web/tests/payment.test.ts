// FR-008 — приём оплаты. Три свойства, каждое из которых при поломке стоит денег:
// подпись раньше записи события, идемпотентность на уровне схемы, апгрейд тарифа.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const SECRET = 'webhook-secret-for-tests';
const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const {
  signWebhook, verifyWebhookSignature, claimWebhookEvent, applyTariffUpgrade,
  recordCheckoutSession, MAX_WEBHOOK_AGE_MS,
} = await import('../src/lib/payment');

/**
 * Вставку в checkout_sessions схема разрешает только app_authenticated (007_rls.sql:63).
 * В тестах транзакция открыта под app_service, поэтому роль переключается точечно —
 * так же, как это делает боевой код через withAccount.
 */
let savepointSeq = 0;
async function asOwner<T>(c: PoolClient, accountId: string, fn: () => Promise<T>): Promise<T> {
  // SAVEPOINT обязателен: если fn упадёт (а часть тестов именно этого и ждёт — проверка
  // границы прав), транзакция перейдёт в aborted, и любой следующий запрос — включая
  // возврат роли — выдаст «current transaction is aborted», подменив настоящую ошибку.
  const sp = `sp_owner_${(savepointSeq += 1)}`;
  await c.query(`SAVEPOINT ${sp}`);
  await c.query('SET LOCAL ROLE app_authenticated');
  await c.query("SELECT set_config('app.current_account_id', $1, true)", [accountId]);
  try {
    const result = await fn();
    await c.query(`RELEASE SAVEPOINT ${sp}`);
    await c.query('SET LOCAL ROLE app_service');
    return result;
  } catch (err) {
    await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await c.query('SET LOCAL ROLE app_service');
    throw err;
  }
}

beforeAll(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
});

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
async function makeProject(c: PoolClient): Promise<{ slug: string; projectId: string; accountId: string }> {
  n += 1;
  const s = `${n}-${Date.now().toString(36)}`;
  const reg = await registerAccountAndProject(c, {
    email: `pay${s}@example.com`, password: 'password-long-enough', desired_slug: `pay-${s}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  const { rows } = await c.query('select id from projects where slug = $1', [reg.slug]);
  return { slug: reg.slug, projectId: rows[0].id, accountId: reg.accountId };
}

/** Инициация оплаты так, как её делает боевой роут: провайдер вне транзакции, вставка от владельца. */
async function checkout(c: PoolClient, p: { projectId: string; accountId: string }, sid: string) {
  const session = { providerSessionId: sid, redirectUrl: 'https://pay.example/go' };
  await asOwner(c, p.accountId, () => recordCheckoutSession(c, p.projectId, session));
  return session;
}

const tierOf = async (c: PoolClient, id: string) =>
  (await c.query('select tier from projects where id = $1', [id])).rows[0].tier;

afterAll(async () => {
  await closePool();
});

describe('подпись вебхука', () => {
  const body = '{"id":"evt_1","type":"payment_succeeded"}';

  it('корректная подпись принимается', () => {
    const ts = Date.now();
    expect(verifyWebhookSignature(body, signWebhook(body, SECRET, ts), String(ts))).toMatchObject({ ok: true });
  });

  it('ИНВАРИАНТ: подпись считается от СЫРОГО тела — пере-сериализация ломает её', () => {
    const ts = Date.now();
    const sig = signWebhook(body, SECRET, ts);
    // Тот же объект, но другой порядок ключей/пробелы — типичный результат JSON.parse→stringify.
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(reserialized, sig, String(ts)).ok).toBe(false);
  });

  it('метка времени входит в подпись — подменить её незаметно нельзя', () => {
    const ts = Date.now();
    const sig = signWebhook(body, SECRET, ts);
    expect(verifyWebhookSignature(body, sig, String(ts + 1)).ok).toBe(false);
  });

  it('чужой секрет не проходит', () => {
    const ts = Date.now();
    expect(verifyWebhookSignature(body, signWebhook(body, 'другой-секрет', ts), String(ts))).toMatchObject({
      ok: false, reason: 'bad_signature',
    });
  });

  it('мусор вместо подписи не роняет проверку', () => {
    const ts = String(Date.now());
    for (const bad of ['', 'не-hex', 'ab', 'zz'.repeat(32), '0'.repeat(63)]) {
      expect(verifyWebhookSignature(body, bad, ts).ok, bad).toBe(false);
    }
  });

  it('без заголовков — отказ', () => {
    const ts = String(Date.now());
    expect(verifyWebhookSignature(body, null, ts)).toMatchObject({ ok: false, reason: 'missing_headers' });
    expect(verifyWebhookSignature(body, 'ab'.repeat(32), null)).toMatchObject({ ok: false, reason: 'missing_headers' });
  });

  it('FAIL-CLOSED: без PAYMENT_WEBHOOK_SECRET не принимается ничего', () => {
    const saved = process.env.PAYMENT_WEBHOOK_SECRET;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const ts = Date.now();
    // Без секрета «принять всё» означало бы бесплатный апгрейд тарифа кому угодно.
    expect(verifyWebhookSignature(body, signWebhook(body, SECRET, ts), String(ts))).toMatchObject({
      ok: false, reason: 'no_secret',
    });
    process.env.PAYMENT_WEBHOOK_SECRET = saved;
  });

  it('старое валидное тело отбрасывается (защита от повтора)', () => {
    const old = Date.now() - MAX_WEBHOOK_AGE_MS - 1000;
    expect(verifyWebhookSignature(body, signWebhook(body, SECRET, old), String(old))).toMatchObject({
      ok: false, reason: 'stale',
    });
  });

  it('метка из БУДУЩЕГО тоже подозрительна', () => {
    const future = Date.now() + MAX_WEBHOOK_AGE_MS + 1000;
    expect(verifyWebhookSignature(body, signWebhook(body, SECRET, future), String(future))).toMatchObject({
      ok: false, reason: 'stale',
    });
  });

  it('на границе окна ещё принимается', () => {
    const now = Date.now();
    const edge = now - MAX_WEBHOOK_AGE_MS + 500;
    expect(verifyWebhookSignature(body, signWebhook(body, SECRET, edge), String(edge), now).ok).toBe(true);
  });
});

describe('идемпотентность (ADR-006)', () => {
  it('первый раз событие захватывается, второй — нет', async () => {
    await inRollback(async (c) => {
      const id = `evt-${Date.now()}`;
      expect(await claimWebhookEvent(c, id, { a: 1 })).toBe(true);
      expect(await claimWebhookEvent(c, id, { a: 1 })).toBe(false);
      expect(await claimWebhookEvent(c, id, { a: 1 })).toBe(false);
    });
  });

  it('разные события независимы', async () => {
    await inRollback(async (c) => {
      const base = Date.now();
      expect(await claimWebhookEvent(c, `a-${base}`, {})).toBe(true);
      expect(await claimWebhookEvent(c, `b-${base}`, {})).toBe(true);
    });
  });

  it('payload сохраняется для разбора инцидентов', async () => {
    await inRollback(async (c) => {
      const id = `evt-payload-${Date.now()}`;
      await claimWebhookEvent(c, id, { type: 'payment_succeeded', amount: 4200 });
      const { rows } = await c.query('select payload from webhook_events where event_id = $1', [id]);
      expect(rows[0].payload).toMatchObject({ type: 'payment_succeeded', amount: 4200 });
    });
  });
});

describe('апгрейд тарифа (Pseudocode §7.3)', () => {
  it('оплата переводит проект на paid и закрывает сессию', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { projectId } = proj;
      const sid = `cs_${Date.now()}`;
      await checkout(c, proj, sid);
      expect(await tierOf(c, projectId)).toBe('free');

      const res = await applyTariffUpgrade(c, sid);
      expect(res).toMatchObject({ applied: true, projectId, alreadyPaid: false });
      expect(await tierOf(c, projectId)).toBe('paid');

      const cs = await c.query('select status from checkout_sessions where provider_session_id = $1', [sid]);
      expect(cs.rows[0].status).toBe('completed');
    });
  });

  it('ПОВТОРНЫЙ апгрейд — no-op, тариф не ломается', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { projectId } = proj;
      const sid = `cs_rep_${Date.now()}`;
      await checkout(c, proj, sid);
      await applyTariffUpgrade(c, sid);
      const again = await applyTariffUpgrade(c, sid);
      expect(again).toMatchObject({ applied: true, alreadyPaid: true });
      expect(await tierOf(c, projectId)).toBe('paid');
    });
  });

  it('апгрейд виден виджету немедленно — badge исчезает без переустановки', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { slug, projectId } = proj;
      const { buildWidgetConfig } = await import('../src/lib/widget-config');
      const sid = `cs_widget_${Date.now()}`;
      await checkout(c, proj, sid);

      expect((await buildWidgetConfig(c, slug)).badge_required).toBe(true);
      await applyTariffUpgrade(c, sid);
      expect((await buildWidgetConfig(c, slug)).badge_required).toBe(false);
    });
  });

  it('неизвестная сессия — не ошибка и не апгрейд', async () => {
    await inRollback(async (c) => {
      expect(await applyTariffUpgrade(c, 'cs_из_чужого_окружения')).toMatchObject({
        applied: false, reason: 'unknown_session',
      });
    });
  });

  it('апгрейд попадает в audit_log с причиной', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { projectId } = proj;
      const sid = `cs_audit_${Date.now()}`;
      await checkout(c, proj, sid);
      await applyTariffUpgrade(c, sid);
      const { rows } = await c.query(
        "select reason from audit_log where project_id = $1 and action = 'tariff_upgraded'", [projectId],
      );
      expect(rows[0].reason).toBe('payment_succeeded');
    });
  });

  it('апгрейд НЕ трогает соседний проект', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      const sid = `cs_iso_${Date.now()}`;
      await checkout(c, a, sid);
      await applyTariffUpgrade(c, sid);
      expect(await tierOf(c, a.projectId)).toBe('paid');
      expect(await tierOf(c, b.projectId)).toBe('free');
    });
  });
});

describe('checkout', () => {
  it('создаёт сессию со статусом pending и привязкой к проекту', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { projectId } = proj;
      const sid = `cs_new_${Date.now()}`;
      const session = await checkout(c, proj, sid);
      expect(session.redirectUrl).toBe('https://pay.example/go');
      const { rows } = await c.query(
        'select project_id, status from checkout_sessions where provider_session_id = $1', [sid],
      );
      expect(rows[0]).toMatchObject({ project_id: projectId, status: 'pending' });
    });
  });

  it('повторный вызов с тем же id провайдера не плодит строк', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      const { projectId } = proj;
      const sid = `cs_dup_${Date.now()}`;
      await checkout(c, proj, sid);
      await checkout(c, proj, sid);
      const { rows } = await c.query(
        'select count(*)::int as n from checkout_sessions where provider_session_id = $1', [sid],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});

describe('граница ролей вокруг оплаты (007_rls.sql)', () => {
  it('app_service НЕ может вставить checkout_session — это дело владельца', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      // Транзакция открыта под app_service. Схема даёт ему только select+update.
      await expect(
        recordCheckoutSession(c, proj.projectId, {
          providerSessionId: `cs_denied_${Date.now()}`,
          redirectUrl: 'u',
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('app_authenticated НЕ может писать в webhook_events — это дело системы', async () => {
    await inRollback(async (c) => {
      const proj = await makeProject(c);
      await expect(
        asOwner(c, proj.accountId, () => claimWebhookEvent(c, `evt_denied_${Date.now()}`, {})),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('владелец видит СВОИ checkout-сессии и не видит чужие (RLS)', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      await checkout(c, a, `cs_rls_a_${Date.now()}`);
      await checkout(c, b, `cs_rls_b_${Date.now()}`);

      const mine = await asOwner(c, a.accountId, async () => {
        const { rows } = await c.query('select project_id from checkout_sessions');
        return rows;
      });
      expect(mine).toHaveLength(1);
      expect(mine[0].project_id).toBe(a.projectId);
    });
  });
});
