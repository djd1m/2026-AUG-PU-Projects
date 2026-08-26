// FR-GROWTH-005 — порог содержательности, двусторонний noindex и anti-abuse (ADR-004).

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { submitTextTestimonial } = await import('../src/lib/testimonial');
const { recomputeContentThreshold, onProjectCreated, CONTENT_THRESHOLD, BULK_THRESHOLD } =
  await import('../src/lib/content-threshold');

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
    email: `th${s}@example.com`,
    password: 'password-long-enough',
    desired_slug: `th-${s}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  const { rows } = await c.query('select id from projects where slug = $1', [reg.slug]);
  return { slug: reg.slug, projectId: rows[0].id, accountId: reg.accountId };
}

/** Добавляет одобренный отзыв заданной длины напрямую — модерация проверяется отдельно. */
async function addApproved(c: PoolClient, projectId: string, chars: number): Promise<void> {
  await c.query(
    `insert into testimonials (project_id, author_name, text, status) values ($1, 'Автор', $2, 'approved')`,
    [projectId, 'т'.repeat(chars)],
  );
}

afterAll(async () => {
  await closePool();
});

describe('порог из ADR-004', () => {
  it('константы зафиксированы: 3 отзыва и 400 символов', () => {
    expect(CONTENT_THRESHOLD).toEqual({ minApprovedCount: 3, minTotalChars: 400 });
  });

  it('новый проект рождается с noindex=true', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      const { rows } = await c.query('select noindex from projects where id = $1', [projectId]);
      expect(rows[0].noindex).toBe(true);
    });
  });

  it('мало отзывов — noindex остаётся, даже если символов достаточно', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      await addApproved(c, projectId, 500); // 1 отзыв, 500 символов
      const r = await recomputeContentThreshold(c, projectId);
      expect(r).toMatchObject({ meetsThreshold: false, approvedCount: 1, noindex: true });
    });
  });

  it('мало символов — noindex остаётся, даже если отзывов достаточно', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      for (let i = 0; i < 5; i += 1) await addApproved(c, projectId, 20); // 5 × 20 = 100
      const r = await recomputeContentThreshold(c, projectId);
      expect(r).toMatchObject({ meetsThreshold: false, approvedCount: 5, totalChars: 100, noindex: true });
    });
  });

  it('оба условия выполнены — noindex СНИМАЕТСЯ и это попадает в аудит', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      for (let i = 0; i < 3; i += 1) await addApproved(c, projectId, 150); // 3 × 150 = 450
      const r = await recomputeContentThreshold(c, projectId);
      expect(r).toMatchObject({ meetsThreshold: true, approvedCount: 3, totalChars: 450, changed: true, noindex: false });

      const { rows } = await c.query('select noindex from projects where id = $1', [projectId]);
      expect(rows[0].noindex).toBe(false);

      const audit = await c.query(
        "select action, reason from audit_log where project_id = $1 and action = 'noindex_removed'",
        [projectId],
      );
      expect(audit.rows[0]).toMatchObject({ action: 'noindex_removed', reason: 'threshold_met' });
    });
  });

  it('ровно на границе (3 отзыва, ровно 400 символов) порог СЧИТАЕТСЯ взятым', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      await addApproved(c, projectId, 134);
      await addApproved(c, projectId, 133);
      await addApproved(c, projectId, 133); // = 400
      const r = await recomputeContentThreshold(c, projectId);
      expect(r.totalChars).toBe(400);
      expect(r.meetsThreshold).toBe(true);
    });
  });

  it('ДВУСТОРОННОСТЬ: убрали контент — noindex вернулся', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      for (let i = 0; i < 3; i += 1) await addApproved(c, projectId, 150);
      expect((await recomputeContentThreshold(c, projectId)).noindex).toBe(false);

      // Владелец скрыл один отзыв — множество approved уменьшилось.
      await c.query(
        `update testimonials set status = 'hidden'
          where id = (select id from testimonials where project_id = $1 limit 1)`,
        [projectId],
      );
      const back = await recomputeContentThreshold(c, projectId);
      expect(back).toMatchObject({ meetsThreshold: false, changed: true, noindex: true });

      const audit = await c.query(
        "select reason from audit_log where project_id = $1 and action = 'noindex_applied'",
        [projectId],
      );
      expect(audit.rows[0].reason).toBe('below_threshold');
    });
  });

  it('ИДЕМПОТЕНТНОСТЬ: повторный вызов без изменений не пишет в аудит', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      for (let i = 0; i < 3; i += 1) await addApproved(c, projectId, 150);

      const first = await recomputeContentThreshold(c, projectId);
      expect(first.changed).toBe(true);
      for (let i = 0; i < 3; i += 1) {
        expect((await recomputeContentThreshold(c, projectId)).changed).toBe(false);
      }
      const audit = await c.query(
        "select count(*)::int as n from audit_log where project_id = $1 and action like 'noindex%'",
        [projectId],
      );
      expect(audit.rows[0].n).toBe(1);
    });
  });

  it('ТРАНСКРИПТ не идёт в зачёт порога — это машинная расшифровка, не текст автора', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      // Три отзыва с пустым text, но длинными транскриптами.
      for (let i = 0; i < 3; i += 1) {
        await c.query(
          `insert into testimonials (project_id, author_name, text, transcript, video_object_key, status)
           values ($1, 'Автор', '', $2, 'k/v.webm', 'approved')`,
          [projectId, 'р'.repeat(500)],
        );
      }
      const r = await recomputeContentThreshold(c, projectId);
      expect(r.approvedCount).toBe(3);
      expect(r.totalChars).toBe(0); // транскрипт не посчитан
      expect(r.meetsThreshold).toBe(false);
    });
  });

  it('только approved идут в зачёт — pending и rejected не считаются', async () => {
    await inRollback(async (c) => {
      const { projectId } = await makeProject(c);
      for (const st of ['pending', 'rejected', 'hidden']) {
        await c.query(
          `insert into testimonials (project_id, author_name, text, status) values ($1, 'А', $2, $3)`,
          [projectId, 'т'.repeat(500), st],
        );
      }
      const r = await recomputeContentThreshold(c, projectId);
      expect(r).toMatchObject({ approvedCount: 0, totalChars: 0, meetsThreshold: false });
    });
  });
});

describe('anti-abuse: массовое создание проектов', () => {
  it('до порога — принудительного noindex нет', async () => {
    await inRollback(async (c) => {
      const { projectId, accountId } = await makeProject(c);
      const r = await onProjectCreated(c, accountId, projectId);
      expect(r.forcedNoindex).toBe(false);
    });
  });

  it(`с ${BULK_THRESHOLD}-го проекта за час — принудительный noindex со следом в аудите`, async () => {
    await inRollback(async (c) => {
      const { projectId, accountId } = await makeProject(c);
      let last = { forcedNoindex: false, count: 0 };
      // makeProject уже вызвал onProjectCreated один раз внутри регистрации.
      for (let i = 0; i < BULK_THRESHOLD; i += 1) {
        last = await onProjectCreated(c, accountId, projectId);
      }
      expect(last.forcedNoindex).toBe(true);
      expect(last.count).toBeGreaterThanOrEqual(BULK_THRESHOLD);

      const audit = await c.query(
        "select reason from audit_log where project_id = $1 and action = 'forced_noindex_bulk_creation'",
        [projectId],
      );
      expect(audit.rows[0].reason).toBe('over_20_projects_per_hour');
    });
  });

  it('лимит НЕ общий: другой аккаунт не наказан за чужую активность', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      for (let i = 0; i < BULK_THRESHOLD; i += 1) await onProjectCreated(c, a.accountId, a.projectId);
      const other = await onProjectCreated(c, b.accountId, b.projectId);
      expect(other.forcedNoindex).toBe(false);
    });
  });

  it('обходного пути нет: принудительный noindex снимается ТЕМ ЖЕ порогом содержательности', async () => {
    await inRollback(async (c) => {
      const { projectId, accountId } = await makeProject(c);
      for (let i = 0; i < BULK_THRESHOLD; i += 1) await onProjectCreated(c, accountId, projectId);
      expect((await c.query('select noindex from projects where id = $1', [projectId])).rows[0].noindex).toBe(true);

      // Единственный путь обратно — реальный контент.
      for (let i = 0; i < 3; i += 1) await addApproved(c, projectId, 150);
      const r = await recomputeContentThreshold(c, projectId);
      expect(r.noindex).toBe(false);
    });
  });
});
