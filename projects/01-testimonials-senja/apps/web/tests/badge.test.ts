// FR-GROWTH-003 — серверная часть badge loop: адрес с метками, приём кликов,
// атрибуция регистрации. Замыкающее звено роста: без него приход есть,
// а знания «откуда» нет, и канал нечем измерить.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { buildWidgetConfig } = await import('../src/lib/widget-config');
const { buildBadgeUrl, parseBadgeAttribution, UTM_SOURCE } = await import('../src/lib/badge');

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
async function makeProject(c: PoolClient): Promise<{ slug: string; projectId: string }> {
  n += 1;
  const s = `${n}-${Date.now().toString(36)}`;
  const reg = await registerAccountAndProject(c, {
    email: `bg${s}@example.com`,
    password: 'password-long-enough',
    desired_slug: `bg-${s}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  const { rows } = await c.query('select id from projects where slug = $1', [reg.slug]);
  return { slug: reg.slug, projectId: rows[0].id };
}

afterAll(async () => {
  await closePool();
});

describe('buildBadgeUrl — метки источника', () => {
  it('несёт источник, канал и слаг приведшего проекта', () => {
    const p = new URL(buildBadgeUrl('https://proofwall.test', 'acme', 'client.com')).searchParams;
    expect(p.get('utm_source')).toBe('widget_badge');
    expect(p.get('utm_medium')).toBe('referral');
    expect(p.get('utm_campaign')).toBe('acme');
    expect(p.get('utm_content')).toBe('client.com');
  });

  it('без домена метка utm_content отсутствует, а не пуста', () => {
    const p = new URL(buildBadgeUrl('https://proofwall.test', 'acme', null)).searchParams;
    expect(p.has('utm_content')).toBe(false);
  });

  it('ведёт на наш публичный адрес, а не на домен клиента', () => {
    expect(buildBadgeUrl('https://proofwall.test', 'acme').startsWith('https://proofwall.test/')).toBe(true);
  });

  it('слаг попадает в параметр, а не в путь — подмена пути невозможна', () => {
    const url = new URL(buildBadgeUrl('https://proofwall.test', '../../evil'));
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('utm_campaign')).toBe('../../evil');
  });
});

describe('parseBadgeAttribution — кого считаем пришедшим по badge', () => {
  it('распознаёт наш источник', () => {
    const a = parseBadgeAttribution('?utm_source=widget_badge&utm_campaign=acme&utm_content=client.com');
    expect(a).toEqual({ source: UTM_SOURCE, campaign: 'acme', content: 'client.com' });
  });

  it('ЧУЖОЙ источник не засчитывается — иначе эффект канала завышен', () => {
    for (const q of [
      '?utm_source=google&utm_campaign=acme',
      '?utm_source=newsletter',
      '?utm_campaign=acme',
      '?',
      '',
      null,
      undefined,
    ]) {
      expect(parseBadgeAttribution(q as string), String(q)).toBeNull();
    }
  });

  it('принимает и строку, и URLSearchParams', () => {
    const params = new URLSearchParams({ utm_source: 'widget_badge', utm_campaign: 'x' });
    expect(parseBadgeAttribution(params)?.campaign).toBe('x');
  });

  it('метки без кампании допустимы — источник всё равно наш', () => {
    expect(parseBadgeAttribution('?utm_source=widget_badge')).toEqual({
      source: UTM_SOURCE, campaign: null, content: null,
    });
  });
});

describe('badge_url в конфигурации виджета', () => {
  it('на free приходит и несёт слаг проекта', async () => {
    await inRollback(async (c) => {
      const { slug } = await makeProject(c);
      const cfg = await buildWidgetConfig(c, slug, 'client.com');
      expect(cfg.badge_required).toBe(true);
      expect(cfg.badge_url).toBeTruthy();
      const p = new URL(cfg.badge_url!).searchParams;
      expect(p.get('utm_campaign')).toBe(slug);
      expect(p.get('utm_content')).toBe('client.com');
    });
  });

  it('на paid badge_url ОТСУТСТВУЕТ — рисовать нечего, и ссылка не утекает', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query("update projects set tier = 'paid' where id = $1", [projectId]);
      const cfg = await buildWidgetConfig(c, slug, 'client.com');
      expect(cfg.badge_required).toBe(false);
      expect(cfg.badge_url).toBeUndefined();
      expect('badge_url' in cfg).toBe(false);
    });
  });

  it('безопасный дефолт для неизвестного проекта тоже даёт ссылку', async () => {
    await inRollback(async (c) => {
      const cfg = await buildWidgetConfig(c, 'no-such', 'client.com');
      expect(cfg.badge_required).toBe(true);
      expect(cfg.badge_url).toBeTruthy();
    });
  });

  it('АПГРЕЙД убирает badge без переустановки виджета (@edge-case)', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      // Тот же слаг, тот же тег на сайте владельца — меняется только строка в БД.
      expect((await buildWidgetConfig(c, slug, 'client.com')).badge_required).toBe(true);
      await c.query("update projects set tier = 'paid' where id = $1", [projectId]);
      const after = await buildWidgetConfig(c, slug, 'client.com');
      expect(after.badge_required).toBe(false);
      expect(after.project_slug).toBe(slug); // код на сайте владельца не менялся
    });
  });
});

describe('signup_from_badge — петля замкнулась', () => {
  it('регистрация с меткой badge фиксирует, ЧЕЙ виджет привёл', async () => {
    await inRollback(async (c) => {
      const referrer = await makeProject(c);
      const reg = await registerAccountAndProject(c, {
        email: `fromdge-${Date.now()}@example.com`,
        password: 'password-long-enough',
        project_name: 'Пришёл по бейджу',
        utm_query: `?utm_source=widget_badge&utm_campaign=${referrer.slug}&utm_content=client.com`,
      });
      if (!reg.ok) throw new Error('регистрация');

      const { rows } = await c.query(
        `select event_type, domain, metadata from analytics_events
          where account_id = $1 and event_type = 'signup_from_badge'`,
        [reg.accountId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].domain).toBe('client.com');
      expect(rows[0].metadata).toMatchObject({
        utm_source: 'widget_badge',
        referrer_project_slug: referrer.slug,
      });
    });
  });

  it('регистрация БЕЗ метки события не создаёт', async () => {
    await inRollback(async (c) => {
      const reg = await registerAccountAndProject(c, {
        email: `plain-${Date.now()}@example.com`,
        password: 'password-long-enough',
        project_name: 'Обычная регистрация',
      });
      if (!reg.ok) throw new Error('регистрация');
      const { rowCount } = await c.query(
        "select 1 from analytics_events where account_id = $1 and event_type = 'signup_from_badge'",
        [reg.accountId],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('регистрация с ЧУЖОЙ меткой не засчитывается нашему каналу', async () => {
    await inRollback(async (c) => {
      const reg = await registerAccountAndProject(c, {
        email: `google-${Date.now()}@example.com`,
        password: 'password-long-enough',
        project_name: 'Из поиска',
        utm_query: '?utm_source=google&utm_medium=cpc&utm_campaign=acme',
      });
      if (!reg.ok) throw new Error('регистрация');
      const { rowCount } = await c.query(
        "select 1 from analytics_events where account_id = $1 and event_type = 'signup_from_badge'",
        [reg.accountId],
      );
      expect(rowCount).toBe(0);
    });
  });
});
