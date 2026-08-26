// packages/db/tests/setup.ts
//
// Общий помощник для интеграционных тестов: реальная Postgres, поднятая с накаченными
// миграциями (см. packages/db/README.md — как поднять тестовую БД). Тесты НЕ мокают pg — по
// правилам проекта (.claude/rules/testing.md §1) RLS/rate-limit/идемпотентность проверяются
// только на реальной БД, юнит-тестом не эмулируются.

import { Pool } from 'pg';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL (или DATABASE_URL) не задан — см. packages/db/README.md "Как запускать тесты"',
    );
  }
  return url;
}

export const adminPool = new Pool({ connectionString: testDatabaseUrl() });

/** Создаёт аккаунт+проект напрямую (без RLS — под суперюзером теста) и возвращает их id. */
export async function seedAccountWithProject(opts?: {
  email?: string;
  slug?: string;
}): Promise<{ accountId: string; projectId: string }> {
  const email = opts?.email ?? `test-${Math.random().toString(36).slice(2)}@example.com`;
  const slug = opts?.slug ?? `slug-${Math.random().toString(36).slice(2, 10)}`;
  const { rows: accountRows } = await adminPool.query<{ id: string }>(
    `insert into accounts (email, password_hash) values ($1, 'x') returning id`,
    [email],
  );
  const accountId = accountRows[0]!.id;
  const { rows: projectRows } = await adminPool.query<{ id: string }>(
    `insert into projects (account_id, slug) values ($1, $2) returning id`,
    [accountId, slug],
  );
  const projectId = projectRows[0]!.id;
  return { accountId, projectId };
}

/** Очистка между тестами — по правилам testing.md изоляция тестов друг от друга обязательна. */
export async function truncateAll(): Promise<void> {
  await adminPool.query(`
    truncate table
      audit_log, commissions, referral_attributions, partner_codes,
      checkout_sessions, webhook_events, rate_limit_events,
      analytics_events, widget_installs, testimonials, sessions,
      projects, accounts
    restart identity cascade
  `);
}

export async function closeAdminPool(): Promise<void> {
  await adminPool.end();
}
