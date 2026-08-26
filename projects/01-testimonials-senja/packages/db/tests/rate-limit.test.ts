// packages/db/tests/rate-limit.test.ts
//
// Источник: docs/Architecture.md §3.4 (единый счётчик скользящего окна), docs/Pseudocode.md §1
// (rateLimitCount/rateLimitRecord/rateLimitRevoke), .claude/rules/security.md §4.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as rateLimit from '../src/rate-limit';
import { adminPool, closeAdminPool, truncateAll } from './setup';

afterAll(async () => {
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
});

describe('rate-limit: единый помощник (Architecture §3.4)', () => {
  it('count растёт с каждым record в пределах окна', async () => {
    const scope = 'form_submission';
    const key = 'ip-hash-1';
    const window = { seconds: 3600 };

    expect(await rateLimit.count(scope, key, window, adminPool)).toBe(0);

    await rateLimit.record(scope, key, adminPool);
    await rateLimit.record(scope, key, adminPool);
    await rateLimit.record(scope, key, adminPool);

    expect(await rateLimit.count(scope, key, window, adminPool)).toBe(3);
  });

  it('exceeded срабатывает ровно на пороге (FR-NFR-SEC-003: 5 в час)', async () => {
    const scope = 'form_submission';
    const key = 'ip-hash-2';
    const window = { seconds: 3600 };
    const threshold = 5;

    for (let i = 0; i < 4; i++) {
      await rateLimit.record(scope, key, adminPool);
    }
    expect(await rateLimit.exceeded(scope, key, window, threshold, adminPool)).toBe(false);

    await rateLimit.record(scope, key, adminPool); // 5-я запись
    expect(await rateLimit.exceeded(scope, key, window, threshold, adminPool)).toBe(true);
  });

  it('события ЗА пределами окна не считаются', async () => {
    const scope = 'signup_via_partner_code';
    const key = '1.2.3.4';

    // Вставляем "старое" событие напрямую (за пределами 10-минутного окна FR-GROWTH-004).
    await adminPool.query(
      `insert into rate_limit_events (scope, key, created_at) values ($1, $2, now() - interval '11 minutes')`,
      [scope, key],
    );

    const withinWindow = await rateLimit.count(scope, key, { seconds: 600 }, adminPool);
    expect(withinWindow).toBe(0);

    const widerWindow = await rateLimit.count(scope, key, { seconds: 3600 }, adminPool);
    expect(widerWindow).toBe(1);
  });

  it('разные scope не смешиваются на одном key (project_created vs form_submission)', async () => {
    const key = 'account-123';
    await rateLimit.record('project_created', key, adminPool);

    const formSubmissionCount = await rateLimit.count(
      'form_submission',
      key,
      { seconds: 3600 },
      adminPool,
    );
    expect(formSubmissionCount).toBe(0);

    const projectCreatedCount = await rateLimit.count(
      'project_created',
      key,
      { seconds: 3600 },
      adminPool,
    );
    expect(projectCreatedCount).toBe(1);
  });

  it('revoke откатывает списанную квоту (W-5: инфраструктурный сбой после списания)', async () => {
    const scope = 'form_submission';
    const key = 'ip-hash-3';
    const window = { seconds: 3600 };

    const id = await rateLimit.record(scope, key, adminPool);
    expect(await rateLimit.count(scope, key, window, adminPool)).toBe(1);

    await rateLimit.revoke(id, adminPool);
    expect(await rateLimit.count(scope, key, window, adminPool)).toBe(0);
  });

  it('cleanupOlderThan удаляет только события старше порога (Architecture §3.4 "Очистка", 24ч)', async () => {
    await adminPool.query(
      `insert into rate_limit_events (scope, key, created_at) values ('form_submission', 'old', now() - interval '25 hours')`,
    );
    await adminPool.query(
      `insert into rate_limit_events (scope, key, created_at) values ('form_submission', 'fresh', now() - interval '1 hour')`,
    );

    const deleted = await rateLimit.cleanupOlderThan(24, adminPool);
    expect(deleted).toBe(1);

    const { rows } = await adminPool.query('select key from rate_limit_events');
    expect(rows.map((r) => r.key)).toEqual(['fresh']);
  });
});
