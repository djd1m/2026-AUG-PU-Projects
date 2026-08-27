// FR-008 — приём оплаты. Три свойства, каждое из которых при поломке стоит денег:
// подлинность раньше записи события, идемпотентность на уровне схемы, апгрейд тарифа.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

process.env.PAYMENTS_STUB = 'true'; // до импорта: модуль читает переменную при вызовах
const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const {
  verifyWebhookOrigin, claimWebhookEvent, applyTariffUpgrade, recordCheckoutSession,
  createRemotePayment, fetchRemotePayment, isStub, YOOKASSA_NETWORKS, CURRENCY, PROVIDER,
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
  process.env.PAYMENTS_STUB = 'true';
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

describe('подлинность уведомления — адрес источника (D-009)', () => {
  it('ЮKassa не подписывает уведомления, поэтому проверки подписи здесь НЕТ', async () => {
    // Фиксируем осознанное отличие от ADR-006: модуль не экспортирует ничего про HMAC.
    const mod = await import('../src/lib/payment');
    for (const gone of ['signWebhook', 'verifyWebhookSignature', 'MAX_WEBHOOK_AGE_MS']) {
      expect(mod, gone).not.toHaveProperty(gone);
    }
    expect(PROVIDER).toBe('yookassa');
    expect(CURRENCY).toBe('RUB');
  });

  it.each(['185.71.76.5', '185.71.77.30', '77.75.153.99', '77.75.156.11', '77.75.156.35',
           '77.75.154.200', '2a02:5180:abcd::1'])('адрес ЮKassa %s принимается', (ip) => {
    expect(verifyWebhookOrigin(ip)).toMatchObject({ ok: true });
  });

  it.each(['8.8.8.8', '127.0.0.1', '10.0.0.1', '185.71.76.32', '77.75.153.128', '2a02:5181::1'])(
    'чужой адрес %s отклоняется', (ip) => {
      expect(verifyWebhookOrigin(ip)).toMatchObject({ ok: false, reason: 'foreign_ip' });
    },
  );

  it('отсутствие адреса — отказ, а не «пропустить»', () => {
    for (const v of ['', '   ', null, undefined, 'unknown']) {
      expect(verifyWebhookOrigin(v as string), String(v)).toMatchObject({ ok: false, reason: 'no_ip' });
    }
  });

  it('список сетей взят из документации ЮKassa и зашит в код', () => {
    // Вынесенный в переменную окружения, он однажды приедет пустым — и это «пускать всех».
    expect(YOOKASSA_NETWORKS).toContain('185.71.76.0/27');
    expect(YOOKASSA_NETWORKS).toContain('2a02:5180::/32');
    expect(YOOKASSA_NETWORKS.length).toBe(7);
  });
});

describe('перезапрос статуса — второй, более сильный рубеж', () => {
  it('в режиме заглушки к ЮKassa не ходим', async () => {
    expect(isStub()).toBe(true);
    const p = await fetchRemotePayment('any-id');
    expect(p).toMatchObject({ id: 'any-id', status: 'succeeded', paid: true });
  });

  it('без учётных данных и без заглушки — явная ошибка, а не тихий пропуск', async () => {
    process.env.PAYMENTS_STUB = 'false';
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    await expect(fetchRemotePayment('x')).rejects.toThrow(/YOOKASSA_SHOP_ID/);
    process.env.PAYMENTS_STUB = 'true';
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

// ─────────────────────────────────────────────────────────────────────────────
// Регрессия: недоступность провайдера не должна «съедать» уведомление.
//
// Найдено разбором кода, не тестами. Цепочка, стоившая бы денег: заявка на event_id
// ставится ШАГОМ 2, перезапрос статуса — ШАГОМ 3. Пока недоступность провайдера
// возвращалась ЗНАЧЕНИЕМ, колбэк withService завершался штатно, транзакция
// КОММИТИЛАСЬ вместе с заявкой, роут отдавал 500, ЮKassa повторяла уведомление,
// повтор упирался в занятый event_id и коротил в 'duplicate' с кодом 200.
// Оплата не применялась НИКОГДА: деньги списаны, тариф не повышен, повторить нечем.
//
// Лечится тем, что недоступность — ИСКЛЮЧЕНИЕ: откат освобождает заявку.
// ─────────────────────────────────────────────────────────────────────────────
// Уборки за собой здесь НЕТ намеренно: схема не даёт app_service удалять из
// webhook_events (только вставка — журнал событий неизменяем, 007_rls.sql). Строки
// уникальны по времени прогона, а тестовая БД одноразовая (tmpfs в compose.test.yml).
describe('провайдер недоступен — уведомление остаётся повторяемым', () => {
  it('исключение внутри транзакции ОТКАТЫВАЕТ заявку на event_id', async () => {
    const id = `evt-rollback-${Date.now()}`;

    await expect(
      withService(async (c) => {
        expect(await claimWebhookEvent(c, id, { first: true })).toBe(true);
        throw new Error('провайдер недоступен');
      }),
    ).rejects.toThrow('провайдер недоступен');

    // Повтор обязан пройти по ПОЛНОМУ пути, а не упереться в занятый идентификатор.
    await withService(async (c) => {
      expect(
        await claimWebhookEvent(c, id, { retry: true }),
        'заявка не была освобождена — повтор уйдёт в duplicate, оплата потеряна',
      ).toBe(true);
    });
  });

  it('штатный возврат из транзакции заявку КОММИТИТ — почему возврат тут и опасен', async () => {
    const id = `evt-commit-${Date.now()}`;

    await withService(async (c) => {
      expect(await claimWebhookEvent(c, id, {})).toBe(true);
      return 'provider_unavailable'; // ровно то, как было написано до починки
    });

    await withService(async (c) => {
      expect(
        await claimWebhookEvent(c, id, {}),
        'заявка пережила транзакцию — это и есть механизм потери оплаты',
      ).toBe(false);
    });
  });
});

// Свойство КОДА, а не одного прогона: ветка недоступности провайдера обязана
// БРОСАТЬ. Поведенческий тест выше проверяет транзакцию; этот — что роут ею
// пользуется правильно и завтра не вернётся к `return`.
describe('роут вебхука: недоступность провайдера выражена исключением', () => {
  const ROUTE = path.resolve(__dirname, '../src/app/api/webhooks/payment/route.ts');
  const code = readFileSync(ROUTE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('не возвращает provider_unavailable из колбэка withService', () => {
    expect(code).not.toMatch(/return\s+'provider_unavailable'\s+as\s+const/);
  });

  it('ветка PaymentProviderError бросает', () => {
    expect(code).toMatch(/instanceof\s+PaymentProviderError\)\s*throw\s+new\s+ProviderUnavailable/);
  });

  it('500 отдаётся снаружи транзакции — из catch, а не из колбэка', () => {
    const catchAt = code.indexOf('catch (err)');
    const fiveHundred = code.indexOf('status: 500');
    expect(catchAt, 'нет внешнего catch').toBeGreaterThan(-1);
    expect(fiveHundred).toBeGreaterThan(catchAt);
  });
});
