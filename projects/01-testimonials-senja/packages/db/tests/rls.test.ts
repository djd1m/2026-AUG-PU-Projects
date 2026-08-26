// packages/db/tests/rls.test.ts
//
// Источник: docs/Architecture.md §3.1 ("аккаунт A не может прочитать отзыв проекта B"),
// .claude/rules/testing.md §7 ("Межпроектный доступ") — порядок по риску #1: мульти-арендная
// изоляция — наивысший приоритет тестирования проекта.
//
// Проверяем ИМЕННО дашборд-путь (withAccount, роль app_authenticated под RLS) — это одна из ДВУХ
// независимых границ, описанных в Architecture §3.1; вторая (app_service/BYPASSRLS + фильтр в
// коде) — обязанность apps/web, packages/db может только гарантировать, что RLS-часть работает.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withAccount } from '../src/index';
import { adminPool, closeAdminPool, seedAccountWithProject, truncateAll } from './setup';

afterAll(async () => {
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
});

describe('RLS: мульти-арендная изоляция (Architecture §3.1)', () => {
  it('аккаунт A не видит проект аккаунта B', async () => {
    const a = await seedAccountWithProject();
    const b = await seedAccountWithProject();

    const seenByA = await withAccount(a.accountId, async (client) => {
      const { rows } = await client.query('select id from projects');
      return rows.map((r) => r.id);
    });

    expect(seenByA).toContain(a.projectId);
    expect(seenByA).not.toContain(b.projectId);
  });

  it('аккаунт A не видит отзыв проекта B (даже зная его id)', async () => {
    const a = await seedAccountWithProject();
    const b = await seedAccountWithProject();
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into testimonials (project_id, author_name, text, status)
       values ($1, 'Bob', 'hello world', 'approved') returning id`,
      [b.projectId],
    );
    const testimonialB = rows[0]!.id;

    const seenByA = await withAccount(a.accountId, async (client) => {
      const { rows: found } = await client.query('select id from testimonials where id = $1', [
        testimonialB,
      ]);
      return found;
    });

    expect(seenByA).toHaveLength(0);
  });

  it('аккаунт A не может изменить отзыв проекта B через UPDATE (moderateTestimonial cross-project)', async () => {
    const a = await seedAccountWithProject();
    const b = await seedAccountWithProject();
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into testimonials (project_id, author_name, text, status)
       values ($1, 'Bob', 'hello world', 'pending') returning id`,
      [b.projectId],
    );
    const testimonialB = rows[0]!.id;

    await withAccount(a.accountId, async (client) => {
      const result = await client.query(
        `update testimonials set status = 'approved' where id = $1`,
        [testimonialB],
      );
      // RLS-политика не даёт UPDATE увидеть чужую строку — затронуто 0 строк, не ошибка.
      expect(result.rowCount).toBe(0);
    });

    const { rows: afterAttempt } = await adminPool.query<{ status: string }>(
      'select status from testimonials where id = $1',
      [testimonialB],
    );
    expect(afterAttempt[0]!.status).toBe('pending'); // не изменилось
  });

  it('аккаунт A видит и может модерировать свой собственный отзыв', async () => {
    const a = await seedAccountWithProject();
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into testimonials (project_id, author_name, text, status)
       values ($1, 'Alice', 'great product', 'pending') returning id`,
      [a.projectId],
    );
    const testimonialA = rows[0]!.id;

    const updated = await withAccount(a.accountId, async (client) => {
      const result = await client.query(
        `update testimonials set status = 'approved' where id = $1 returning status`,
        [testimonialA],
      );
      return result.rows[0]?.status;
    });

    expect(updated).toBe('approved');
  });

  it('widget_installs проекта B не виден аккаунту A', async () => {
    const a = await seedAccountWithProject();
    const b = await seedAccountWithProject();
    await adminPool.query(`insert into widget_installs (project_id, domain) values ($1, 'b-site.example')`, [
      b.projectId,
    ]);

    const seenByA = await withAccount(a.accountId, async (client) => {
      const { rows } = await client.query('select domain from widget_installs');
      return rows;
    });

    expect(seenByA).toHaveLength(0);
  });
});
