// FR-GROWTH-001 — «метрика недели». Считаем САЙТЫ, а не людей: обе метрики имеют
// одну гранулярность (project_id, domain) и живут за счёт одной атомарной вставки.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.APP_DOMAIN = 'proofwall.test';

const { withService, closePool, pool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { recordInstallAndInviteIfNeeded, normalizeDomain, isOwnDomain } =
  await import('../src/lib/widget-install');

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
async function makeProject(c: PoolClient): Promise<string> {
  n += 1;
  const s = `${n}-${Date.now().toString(36)}`;
  const reg = await registerAccountAndProject(c, {
    email: `gi${s}@example.com`,
    password: 'password-long-enough',
    desired_slug: `gi-${s}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  const { rows } = await c.query('select id from projects where slug = $1', [reg.slug]);
  return rows[0].id;
}

async function eventsOf(c: PoolClient, projectId: string): Promise<string[]> {
  const { rows } = await c.query<{ event_type: string }>(
    'select event_type from analytics_events where project_id = $1 order by id',
    [projectId],
  );
  return rows.map((r) => r.event_type);
}

afterAll(async () => {
  await closePool();
});

describe('normalizeDomain — домен попадает в unique-ключ, значит форма важна', () => {
  it('один сайт в разных написаниях даёт ОДНУ строку', () => {
    const expected = 'example.com';
    for (const v of [
      'example.com',
      'Example.COM',
      '  example.com  ',
      'https://example.com',
      'https://example.com/path?a=1',
      'https://www.example.com',
      'http://Example.com:8080',
    ]) {
      expect(normalizeDomain(v), v).toBe(expected);
    }
  });

  it('разные сайты остаются разными', () => {
    expect(normalizeDomain('a.example.com')).toBe('a.example.com');
    expect(normalizeDomain('example.com')).not.toBe(normalizeDomain('example.org'));
  });

  it('мусор и пустота дают null, а не пустую строку в ключе', () => {
    for (const v of ['', '   ', null, undefined, '://', 'не url']) {
      expect(normalizeDomain(v as string), String(v)).toBeNull();
    }
  });

  it('ЛИТЕРАЛЬНОЕ "null" из Origin — это отсутствие домена, а не домен', () => {
    // Браузер шлёт Origin: null для file:// и sandboxed iframe. До правки эта строка
    // уезжала в utm_content ссылки badge как "null" — поймано браузерной проверкой.
    for (const v of ['null', 'NULL', ' null ', 'undefined']) {
      expect(normalizeDomain(v), v).toBeNull();
    }
  });

  it('наш собственный домен распознаётся', () => {
    expect(isOwnDomain('proofwall.test')).toBe(true);
    expect(isOwnDomain('localhost')).toBe(true);
    expect(isOwnDomain('example.com')).toBe(false);
  });
});

describe('первая установка на домене', () => {
  it('новый домен → ОБА события сразу, одной точкой эмиссии', async () => {
    await inRollback(async (c) => {
      const p = await makeProject(c);
      const r = await recordInstallAndInviteIfNeeded(c, p, 'https://client-site.com');
      expect(r).toEqual({ isNewDomain: true, domain: 'client-site.com' });
      expect(await eventsOf(c, p)).toEqual(['widget_installed', 'invite_shown']);
    });
  });

  it('ПОВТОРНЫЙ рендер на том же домене не порождает НИ ОДНОГО события', async () => {
    await inRollback(async (c) => {
      const p = await makeProject(c);
      await recordInstallAndInviteIfNeeded(c, p, 'client-site.com');
      for (let i = 0; i < 5; i += 1) {
        const again = await recordInstallAndInviteIfNeeded(c, p, 'https://client-site.com/other-page');
        expect(again.isNewDomain).toBe(false);
      }
      // Ровно два события за всё время, а не двенадцать.
      expect(await eventsOf(c, p)).toEqual(['widget_installed', 'invite_shown']);
    });
  });

  it('повторный рендер обновляет last_seen_at, не трогая first_seen_at', async () => {
    // РАЗНЫЕ транзакции намеренно: now() в Postgres — время НАЧАЛА транзакции и внутри
    // неё не движется. В проде каждый запрос виджета — своя транзакция, поэтому проверять
    // сдвиг времени в одной транзакции значило бы проверять не то, что происходит.
    const projectId = await withService((c) => makeProject(c));
    await withService((c) => recordInstallAndInviteIfNeeded(c, projectId, 'lastseen.com'));

    const before = await withService(async (c) => {
      const { rows } = await c.query(
        'select first_seen_at, last_seen_at from widget_installs where project_id = $1',
        [projectId],
      );
      return rows[0];
    });

    await withService((c) => recordInstallAndInviteIfNeeded(c, projectId, 'lastseen.com'));

    const after = await withService(async (c) => {
      const { rows } = await c.query(
        'select first_seen_at, last_seen_at from widget_installs where project_id = $1',
        [projectId],
      );
      return rows[0];
    });

    expect(after.first_seen_at).toEqual(before.first_seen_at);
    expect(new Date(after.last_seen_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.last_seen_at).getTime(),
    );
    // И главное: повторная установка не породила событий.
    const events = await withService((c) => eventsOf(c, projectId));
    expect(events).toEqual(['widget_installed', 'invite_shown']);
  });

  it('РАЗНЫЕ домены одного проекта — каждый со своей парой событий (не дефект)', async () => {
    await inRollback(async (c) => {
      const p = await makeProject(c);
      await recordInstallAndInviteIfNeeded(c, p, 'first.com');
      await recordInstallAndInviteIfNeeded(c, p, 'second.com');
      expect(await eventsOf(c, p)).toEqual([
        'widget_installed', 'invite_shown', 'widget_installed', 'invite_shown',
      ]);
      const { rows } = await c.query('select domain from widget_installs where project_id = $1 order by domain', [p]);
      expect(rows.map((r) => r.domain)).toEqual(['first.com', 'second.com']);
    });
  });

  it('один домен у РАЗНЫХ проектов — независимые установки', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      expect((await recordInstallAndInviteIfNeeded(c, a, 'shared.com')).isNewDomain).toBe(true);
      expect((await recordInstallAndInviteIfNeeded(c, b, 'shared.com')).isNewDomain).toBe(true);
    });
  });
});

describe('что установкой НЕ считается (Pseudocode §4 edge-case)', () => {
  it('рендер на нашем домене — превью и дашборд', async () => {
    await inRollback(async (c) => {
      const p = await makeProject(c);
      for (const d of ['https://proofwall.test/dashboard/x', 'localhost:3000', 'http://127.0.0.1:3000']) {
        expect((await recordInstallAndInviteIfNeeded(c, p, d)).isNewDomain, d).toBe(false);
      }
      expect(await eventsOf(c, p)).toEqual([]);
    });
  });

  it('пустой или нечитаемый домен', async () => {
    await inRollback(async (c) => {
      const p = await makeProject(c);
      for (const d of ['', null, undefined, '   ']) {
        expect((await recordInstallAndInviteIfNeeded(c, p, d as string)).isNewDomain).toBe(false);
      }
      expect(await eventsOf(c, p)).toEqual([]);
      const { rowCount } = await c.query('select 1 from widget_installs where project_id = $1', [p]);
      expect(rowCount).toBe(0);
    });
  });
});

describe('ГОНКА: два первых рендера на разных страницах одного сайта', () => {
  it('дают ровно ОДИН invite_shown — дедупликация на уровне СУБД', async () => {
    // Требуются РЕАЛЬНО параллельные соединения: внутри одной транзакции гонки нет.
    const projectId = await withService((c) => makeProject(c));
    const CONCURRENCY = 8;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE app_service');
          const r = await recordInstallAndInviteIfNeeded(client, projectId, 'race-test.com');
          await client.query('COMMIT');
          return r.isNewDomain;
        } catch {
          await client.query('ROLLBACK').catch(() => undefined);
          return false;
        } finally {
          client.release();
        }
      }),
    );

    // Победитель ровно один — остальные получили ON CONFLICT DO NOTHING.
    expect(results.filter(Boolean)).toHaveLength(1);

    const events = await withService((c) => eventsOf(c, projectId));
    expect(events.filter((e) => e === 'invite_shown')).toHaveLength(1);
    expect(events.filter((e) => e === 'widget_installed')).toHaveLength(1);

    const installs = await withService(async (c) => {
      const { rowCount } = await c.query('select 1 from widget_installs where project_id = $1', [projectId]);
      return rowCount;
    });
    expect(installs).toBe(1);
  });
});
