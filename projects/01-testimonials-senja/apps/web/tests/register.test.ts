// FR-001 на живой Postgres — не на моках: проверяется в том числе то, что схема
// действительно принимает вставки (RLS, grants, not-null), а не только логика ветвлений.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) {
  throw new Error('TEST_DATABASE_URL (или DATABASE_URL) не задан — см. packages/db/README.md');
}
// Пул в @proofwall/db создаётся на импорте модуля — переменная должна стоять ДО него.
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { hashSessionToken } = await import('../src/lib/session');
const { verifyPassword } = await import('../src/lib/password');

/** Каждый тест — в откатываемой транзакции: база не засоряется между прогонами. */
async function inRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withService(async (client) => {
    const result = await fn(client);
    // Бросаем маркер, чтобы withService откатил транзакцию, и ловим его снаружи.
    throw Object.assign(new Error('__rollback__'), { __result: result });
  }).catch((err: Error & { __result?: T }) => {
    if (err.message === '__rollback__') return err.__result as T;
    throw err;
  });
}

beforeAll(async () => {
  await withService(async (c) => {
    await c.query('select 1');
  });
});

afterAll(async () => {
  await closePool();
});

let unique = 0;
beforeEach(() => {
  unique += 1;
});
const email = () => `owner${unique}-${Date.now()}@example.com`;

describe('FR-001 happy path', () => {
  it('создаёт аккаунт, проект, сессию и запись аудита одной транзакцией', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, {
        email: email(),
        password: 'correct-horse-battery',
        project_name: 'Acme Reviews',
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.status).toBe(201);
      expect(res.slug).toBe('acme-reviews');

      const acc = await c.query('select email, password_hash from accounts where id = $1', [res.accountId]);
      expect(acc.rowCount).toBe(1);
      // Пароль в БД лежит хешем, а не открытым текстом.
      expect(acc.rows[0].password_hash).not.toContain('correct-horse-battery');
      expect(await verifyPassword(acc.rows[0].password_hash, 'correct-horse-battery')).toBe(true);

      const proj = await c.query('select tier, noindex, account_id from projects where slug = $1', [res.slug]);
      expect(proj.rows[0]).toMatchObject({ tier: 'free', noindex: true, account_id: res.accountId });

      const audit = await c.query(
        "select action, entity_type, actor_id from audit_log where actor_id = $1",
        [res.accountId],
      );
      expect(audit.rows[0]).toMatchObject({
        action: 'account_and_project_created',
        entity_type: 'project',
      });
    });
  });

  it('ИНВАРИАНТ: в sessions лежит ХЕШ токена, самого токена там нет', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, {
        email: email(),
        password: 'another-good-password',
        project_name: 'Token Check',
      });
      if (!res.ok) throw new Error('ожидался успех');

      const s = await c.query('select token_hash, expires_at, revoked_at from sessions where account_id = $1', [
        res.accountId,
      ]);
      expect(s.rowCount).toBe(1);
      expect(s.rows[0].token_hash).toBe(hashSessionToken(res.token));
      expect(s.rows[0].token_hash).not.toBe(res.token);
      expect(s.rows[0].revoked_at).toBeNull();
      expect(new Date(s.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  it('выдаёт три адреса и сниппет сразу — AC «доступны до первого отзыва»', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, {
        email: email(),
        password: 'password-long-enough',
        desired_slug: 'my-wall',
      });
      if (!res.ok) throw new Error('ожидался успех');

      expect(res.urls.submission_form).toBe('https://proofwall.test/f/my-wall');
      expect(res.urls.wall_of_love).toBe('https://proofwall.test/w/my-wall');
      expect(res.urls.dashboard).toBe('https://proofwall.test/dashboard/my-wall');
      expect(res.urls.widget_snippet).toContain('data-slug="my-wall"');
      expect(res.urls.widget_snippet).toContain('async');
    });
  });
});

describe('FR-001 граничные случаи (Pseudocode §9)', () => {
  it('невалидный email и короткий пароль → 400 со списком ошибок', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, { email: 'not-an-email', password: 'short' });
      expect(res.status).toBe(400);
      if (res.ok) throw new Error('не должно быть ok');
      expect((res.body as { errors: string[] }).errors).toHaveLength(2);
    });
  });

  it('занятый email → 409, второй аккаунт не создаётся', async () => {
    await inRollback(async (c) => {
      const dup = email();
      const first = await registerAccountAndProject(c, { email: dup, password: 'password-long-enough', project_name: 'One' });
      expect(first.ok).toBe(true);

      const second = await registerAccountAndProject(c, { email: dup, password: 'password-long-enough', project_name: 'Two' });
      expect(second.status).toBe(409);

      const count = await c.query('select count(*)::int as n from accounts where email = $1', [dup]);
      expect(count.rows[0].n).toBe(1);
    });
  });

  it('email сравнивается без учёта регистра', async () => {
    await inRollback(async (c) => {
      const base = email();
      await registerAccountAndProject(c, { email: base, password: 'password-long-enough', project_name: 'A' });
      const second = await registerAccountAndProject(c, {
        email: base.toUpperCase(),
        password: 'password-long-enough',
        project_name: 'B',
      });
      expect(second.status).toBe(409);
    });
  });

  it('явно указанный слаг вне формата → 400, а не молчаливая нормализация', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, {
        email: email(),
        password: 'password-long-enough',
        desired_slug: 'ab', // короче 3 символов
      });
      expect(res.status).toBe(400);
    });
  });

  it('явно указанный ЗАНЯТЫЙ слаг → 409, без подмены суффиксом', async () => {
    await inRollback(async (c) => {
      await registerAccountAndProject(c, { email: email(), password: 'password-long-enough', desired_slug: 'taken-slug' });
      const res = await registerAccountAndProject(c, {
        email: email() + 'x',
        password: 'password-long-enough',
        desired_slug: 'taken-slug',
      });
      expect(res.status).toBe(409);
      if (res.ok) throw new Error('не ok');
      expect((res.body as { field?: string }).field).toBe('slug');
    });
  });

  it('АВТО-слаг при коллизии добирается суффиксом (в отличие от явного)', async () => {
    await inRollback(async (c) => {
      const first = await registerAccountAndProject(c, {
        email: email(),
        password: 'password-long-enough',
        project_name: 'Collide Me',
      });
      if (!first.ok) throw new Error('ожидался успех');
      expect(first.slug).toBe('collide-me');

      const second = await registerAccountAndProject(c, {
        email: email() + 'y',
        password: 'password-long-enough',
        project_name: 'Collide Me',
      });
      if (!second.ok) throw new Error('ожидался успех');
      expect(second.slug).not.toBe('collide-me');
      expect(second.slug.startsWith('collide-me-')).toBe(true);
    });
  });

  it('название из кириллицы даёт валидный слаг, а не пустой', async () => {
    await inRollback(async (c) => {
      const res = await registerAccountAndProject(c, {
        email: email(),
        password: 'password-long-enough',
        project_name: 'Отзывы клиентов',
      });
      if (!res.ok) throw new Error('ожидался успех');
      expect(res.slug).toMatch(/^[a-z0-9-]{3,40}$/);
    });
  });

  it('провал на любом шаге не оставляет частичных данных (атомарность)', async () => {
    await inRollback(async (c) => {
      const dup = email();
      await registerAccountAndProject(c, { email: dup, password: 'password-long-enough', desired_slug: 'atomic-one' });
      // Второй заход падает на занятом email ПОСЛЕ проверки — аккаунт не должен появиться.
      //
      // Считаем СВОИ строки, а не всю таблицу. Глобальный count(*) здесь был скрытой
      // миной: тесты идут параллельно, а маршрутные тесты (login-route.test.ts) КОММИТЯТ
      // настоящие регистрации — маршрут открывает свою транзакцию, откатить её нечем.
      // Чужая запись попадала между before и after, и тест падал на ровном месте,
      // сообщая о нарушении атомарности, которого нет.
      const mine = () => c.query<{ n: number }>(
        'select count(*)::int as n from accounts where email = $1', [dup],
      );
      const before = await mine();
      const res = await registerAccountAndProject(c, { email: dup, password: 'password-long-enough', desired_slug: 'atomic-two' });
      expect(res.status).toBe(409);
      const after = await mine();
      expect(after.rows[0]!.n, 'повторная регистрация создала второй аккаунт на тот же email')
        .toBe(before.rows[0]!.n);
      const orphan = await c.query('select 1 from projects where slug = $1', ['atomic-two']);
      expect(orphan.rowCount).toBe(0);
    });
  });
});
