// packages/db/tests/widget-installs.test.ts
//
// Источник: docs/Architecture.md §3.3 (widget_installed/invite_shown — одна гранулярность,
// UNIQUE(project_id, domain), атомарная вставка ON CONFLICT DO NOTHING RETURNING id),
// docs/Pseudocode.md §4 (recordInstallAndInviteIfNeeded), .claude/rules/testing.md §3
// ("Гонка на widget_installs" — момент ценности + метрика недели).
//
// Это ЯДРО метрики недели (CLAUDE.md: "число установленных виджетов на внешних доменах — цель
// 10 за неделю") — регресс здесь ломает единственную метрику проекта, не просто баг.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminPool, closeAdminPool, seedAccountWithProject, truncateAll } from './setup';

afterAll(async () => {
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
});

/** Точная реализация атомарной вставки из Pseudocode §4 — ровно то, что должен делать API-роут. */
async function recordInstall(projectId: string, domain: string) {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into widget_installs (project_id, domain, first_seen_at, last_seen_at)
     values ($1, $2, now(), now())
     on conflict (project_id, domain) do nothing
     returning id`,
    [projectId, domain],
  );
  if (rows.length === 0) {
    await adminPool.query(
      `update widget_installs set last_seen_at = now() where project_id = $1 and domain = $2`,
      [projectId, domain],
    );
  }
  return rows[0]?.id ?? null; // не null ⇒ НОВЫЙ домен ⇒ эмитировать widget_installed + invite_shown
}

describe('widget_installs: UNIQUE(project_id, domain) — ядро метрики недели', () => {
  it('повторная вставка той же пары (project_id, domain) не создаёт вторую строку', async () => {
    const { projectId } = await seedAccountWithProject();

    const first = await recordInstall(projectId, 'client-site.example');
    const second = await recordInstall(projectId, 'client-site.example');

    expect(first).not.toBeNull(); // первый раз — новый домен, событие эмитируется
    expect(second).toBeNull(); // повтор — конфликт, событие НЕ эмитируется

    const { rows } = await adminPool.query(
      'select count(*)::int as n from widget_installs where project_id = $1 and domain = $2',
      [projectId, 'client-site.example'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('новая пара (тот же проект, другой домен) создаёт новую строку', async () => {
    const { projectId } = await seedAccountWithProject();

    const first = await recordInstall(projectId, 'site-one.example');
    const second = await recordInstall(projectId, 'site-two.example');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull(); // регресс-барьер против отменённой версии "invite_shown раз на проект"

    const { rows } = await adminPool.query(
      'select count(*)::int as n from widget_installs where project_id = $1',
      [projectId],
    );
    expect(rows[0].n).toBe(2);
  });

  it('N параллельных вставок на один и тот же новый домен дают ровно одну строку и ровно один "победитель"', async () => {
    const { projectId } = await seedAccountWithProject();
    const N = 10;

    const results = await Promise.all(
      Array.from({ length: N }, () => recordInstall(projectId, 'race.example')),
    );

    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1); // ровно один вызов получил непустой RETURNING ⇒ ровно одно эмиссия событий

    const { rows } = await adminPool.query(
      'select count(*)::int as n from widget_installs where project_id = $1 and domain = $2',
      [projectId, 'race.example'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('вторая пара проекта не блокируется первой (unique составной, не на одном столбце)', async () => {
    const p1 = await seedAccountWithProject();
    const p2 = await seedAccountWithProject();

    // Один и тот же домен на двух РАЗНЫХ проектах — обе вставки должны пройти (unique составной
    // на (project_id, domain), не на domain отдельно).
    const r1 = await recordInstall(p1.projectId, 'shared-domain.example');
    const r2 = await recordInstall(p2.projectId, 'shared-domain.example');

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
  });
});
