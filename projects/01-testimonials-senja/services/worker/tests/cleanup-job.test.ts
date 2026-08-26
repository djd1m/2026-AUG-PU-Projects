/**
 * tests/cleanup-job.test.ts
 *
 * Architecture §3.4: "удаляет строки старше 24 часов". Проверяет границу и то, что
 * очистка не трогает недавние события (иначе rate-limit «протекал» бы — окна короче
 * 24 часов не досчитались бы событий, которые ещё должны учитываться).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { cleanupRateLimitEvents } from "../src/cleanup-job.js";
import { createTestPool, dropSchema, setupSchema, testDatabaseUrl, truncateAll } from "./helpers/test-db.js";

const hasTestDb = !!testDatabaseUrl();

describe.skipIf(!hasTestDb)("cleanupRateLimitEvents — граница 24 часов", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
    await setupSchema(pool);
  });

  afterEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await dropSchema(pool);
    await pool.end();
  });

  async function insertAt(scope: string, key: string, hoursAgo: number): Promise<void> {
    await pool.query(
      `INSERT INTO rate_limit_events (scope, key, created_at) VALUES ($1, $2, now() - make_interval(hours => $3))`,
      [scope, key, hoursAgo],
    );
  }

  it("удаляет строки старше 24ч, оставляет свежие (form_submission/signup_via_partner_code/project_created — общая таблица, security.md §4)", async () => {
    await insertAt("form_submission", "1.2.3.4:proj-1", 25); // старая — удалить
    await insertAt("signup_via_partner_code", "5.6.7.8", 30); // старая — удалить
    await insertAt("project_created", "acct-1", 23); // свежая — оставить
    await insertAt("form_submission", "9.9.9.9:proj-2", 0.1); // совсем свежая — оставить

    const { deletedRows } = await cleanupRateLimitEvents(pool, 24);
    expect(deletedRows).toBe(2);

    const { rows } = await pool.query(`SELECT scope, key FROM rate_limit_events ORDER BY scope`);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.scope).sort()).toEqual(["form_submission", "project_created"]);
  });

  it("ничего не удаляет, если все события свежие", async () => {
    await insertAt("form_submission", "1.1.1.1:proj-1", 1);
    const { deletedRows } = await cleanupRateLimitEvents(pool, 24);
    expect(deletedRows).toBe(0);
  });
});
