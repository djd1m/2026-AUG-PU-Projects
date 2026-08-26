// FR-004 — переходы состояний, обратимость, аудит и граница арендаторов.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, withAccount, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { submitTextTestimonial } = await import('../src/lib/testimonial');
const {
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  resolveOwnership,
  applyTransition,
  logCrossProjectDenial,
} = await import('../src/lib/moderation');

let n = 0;
/** Создаёт владельца с проектом и одним pending-отзывом. Данные КОММИТЯТСЯ:
 *  withAccount и withService — разные транзакции, откатом их не связать. */
async function seed(): Promise<{ accountId: string; slug: string; testimonialId: string }> {
  n += 1;
  const suffix = `${n}-${Date.now().toString(36)}`;
  return withService(async (c) => {
    const reg = await registerAccountAndProject(c, {
      email: `mod${suffix}@example.com`,
      password: 'password-long-enough',
      desired_slug: `mod-${suffix}`,
    });
    if (!reg.ok) throw new Error('регистрация не удалась');
    const sub = await submitTextTestimonial(c, reg.slug, `ip-${suffix}`, {
      type: 'text',
      name: 'Автор',
      text: 'достаточно длинный текст отзыва',
    });
    if (!sub.ok) throw new Error('отзыв не создан');
    return { accountId: reg.accountId, slug: reg.slug, testimonialId: sub.publicId };
  });
}

async function statusOf(id: string): Promise<string> {
  return withService(async (c) => {
    const { rows } = await c.query('select status from testimonials where id = $1', [id]);
    return rows[0]?.status;
  });
}

afterAll(async () => {
  await closePool();
});

describe('ALLOWED_TRANSITIONS — Pseudocode §2', () => {
  it('pending → approved|rejected, но не hidden', () => {
    expect(isAllowedTransition('pending', 'approved')).toBe(true);
    expect(isAllowedTransition('pending', 'rejected')).toBe(true);
    expect(isAllowedTransition('pending', 'hidden')).toBe(false);
  });

  it('обратимость: из rejected и hidden можно вернуться в approved', () => {
    expect(isAllowedTransition('rejected', 'approved')).toBe(true);
    expect(isAllowedTransition('hidden', 'approved')).toBe(true);
  });

  it('переход в себя запрещён во всех состояниях', () => {
    for (const s of ['pending', 'approved', 'rejected', 'hidden'] as const) {
      expect(isAllowedTransition(s, s), s).toBe(false);
    }
  });

  it('вернуться в pending нельзя ниоткуда — модерация необратима только в эту сторону', () => {
    for (const s of ['approved', 'rejected', 'hidden'] as const) {
      expect(isAllowedTransition(s, 'pending'), s).toBe(false);
    }
    expect(Object.values(ALLOWED_TRANSITIONS).flat()).not.toContain('pending');
  });
});

describe('FR-004 переход состояния', () => {
  it('владелец одобряет свой отзыв: статус меняется, moderated_at проставляется', async () => {
    const { accountId, testimonialId } = await seed();
    const own = await withService((c) => resolveOwnership(c, testimonialId, accountId));
    expect(own).toMatchObject({ exists: true, owned: true, status: 'pending' });

    const applied = await withAccount(accountId, (c) =>
      applyTransition(c, testimonialId, 'pending', 'approved', accountId),
    );
    expect(applied).toBe(true);
    expect(await statusOf(testimonialId)).toBe('approved');

    const audit = await withService(async (c) => {
      const { rows } = await c.query(
        "select action, reason, actor_id from audit_log where entity_id = $1 and action = 'state_transition'",
        [testimonialId],
      );
      return rows[0];
    });
    expect(audit).toMatchObject({ action: 'state_transition', reason: 'pending -> approved', actor_id: accountId });
  });

  it('полный цикл обратимости approved → hidden → approved', async () => {
    const { accountId, testimonialId } = await seed();
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'pending', 'approved', accountId));
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'approved', 'hidden', accountId));
    expect(await statusOf(testimonialId)).toBe('hidden');
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'hidden', 'approved', accountId));
    expect(await statusOf(testimonialId)).toBe('approved');
  });

  it('оптимистичная блокировка: переход из УЖЕ изменившегося состояния не проходит', async () => {
    const { accountId, testimonialId } = await seed();
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'pending', 'approved', accountId));
    // Вторая вкладка думает, что отзыв всё ещё pending.
    const stale = await withAccount(accountId, (c) =>
      applyTransition(c, testimonialId, 'pending', 'rejected', accountId),
    );
    expect(stale).toBe(false);
    expect(await statusOf(testimonialId)).toBe('approved'); // чужой переход не затёрт
  });
});

describe('FR-NFR-SEC-001 — граница арендаторов', () => {
  it('чужой отзыв: exists=true, owned=false — 403 отличим от 404', async () => {
    const a = await seed();
    const b = await seed();
    const own = await withService((c) => resolveOwnership(c, b.testimonialId, a.accountId));
    expect(own.exists).toBe(true);
    expect(own.owned).toBe(false);
  });

  it('несуществующий отзыв: exists=false — это 404, а не 403', async () => {
    const a = await seed();
    const own = await withService((c) =>
      resolveOwnership(c, '00000000-0000-0000-0000-000000000000', a.accountId),
    );
    expect(own.exists).toBe(false);
  });

  it('RLS не даёт применить переход к чужому отзыву даже при обходе проверки', async () => {
    const a = await seed();
    const b = await seed();
    // Намеренно вызываем applyTransition в обход resolveOwnership — так проверяется,
    // что RLS является ВТОРЫМ, независимым рубежом, а не декорацией.
    const applied = await withAccount(a.accountId, (c) =>
      applyTransition(c, b.testimonialId, 'pending', 'approved', a.accountId),
    );
    expect(applied).toBe(false);
    expect(await statusOf(b.testimonialId)).toBe('pending');
  });

  it('отказ по чужому проекту попадает в audit_log', async () => {
    const a = await seed();
    const b = await seed();
    await withService((c) => logCrossProjectDenial(c, b.testimonialId, a.accountId));
    const rows = await withService(async (c) => {
      const r = await c.query(
        "select action, project_id, actor_id from audit_log where entity_id = $1 and action = 'moderation_denied_cross_project'",
        [b.testimonialId],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    // project_id = null: событие привязано к актору, а не к проекту, в который он не вхож.
    expect(rows[0]).toMatchObject({ project_id: null, actor_id: a.accountId });
  });
});

describe('Инвариант FR-004: только approved публичен', () => {
  it('выборка для стены отдаёт approved и не отдаёт остальные', async () => {
    const { accountId, slug, testimonialId } = await seed();
    const visible = async () =>
      withService(async (c) => {
        const { rows } = await c.query(
          `select t.id from testimonials t join projects p on p.id = t.project_id
            where p.slug = $1 and t.status = 'approved'`,
          [slug],
        );
        return rows.map((r) => r.id);
      });

    expect(await visible()).toEqual([]); // pending не виден
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'pending', 'approved', accountId));
    expect(await visible()).toEqual([testimonialId]);
    await withAccount(accountId, (c) => applyTransition(c, testimonialId, 'approved', 'hidden', accountId));
    expect(await visible()).toEqual([]); // скрытый снова невиден
  });
});
