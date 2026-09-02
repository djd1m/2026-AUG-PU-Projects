// FR-006 — серверная конфигурация виджета. Главный инвариант (ADR-002): решение
// о badge принимает СЕРВЕР, а тариф наружу не уходит вовсе.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { submitTextTestimonial } = await import('../src/lib/testimonial');
const { buildWidgetConfig, safeDefault, TESTIMONIAL_LIMIT } = await import('../src/lib/widget-config');

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
    email: `wc${s}@example.com`,
    password: 'password-long-enough',
    desired_slug: `wc-${s}`,
  });
  if (!reg.ok) throw new Error('регистрация');
  const { rows } = await c.query('select id from projects where slug = $1', [reg.slug]);
  return { slug: reg.slug, projectId: rows[0].id };
}

async function addApproved(c: PoolClient, projectId: string, text: string): Promise<string> {
  const { rows } = await c.query(
    `insert into testimonials (project_id, author_name, text, status)
     values ($1, 'Автор', $2, 'approved') returning id`,
    [projectId, text],
  );
  return rows[0].id;
}

afterAll(async () => {
  await closePool();
});

describe('ADR-002 — badge решает сервер', () => {

  it('ПРОСРОЧЕННАЯ оплата возвращает badge — срок кончился, канал роста снова работает', async () => {
    // До 018 колонки срока не было вовсе, и одна оплата снимала badge навсегда: продавать
    // «990 ₽ / 30 дней» при такой записи значило обещать месяц, а выдавать пожизненно.
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query(
        "update projects set tier = 'paid', paid_until = now() - interval '1 second' where id = $1",
        [projectId]);
      const cfg = await buildWidgetConfig(c, slug, 'client.example');
      expect(cfg?.badge_required, 'просроченный платный обязан снова показывать badge').toBe(true);
    });
  });
  it('free → badge_required = true', async () => {
    await inRollback(async (c) => {
      const { slug } = await makeProject(c);
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.badge_required).toBe(true);
    });
  });

  it('paid → badge_required = false', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query("update projects set tier = 'paid', paid_until = now() + interval '30 days' where id = $1", [projectId]);
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.badge_required).toBe(false);
    });
  });

  it('ИНВАРИАНТ: tier НЕ уходит в ответ ни в каком виде', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query("update projects set tier = 'paid', paid_until = now() + interval '30 days' where id = $1", [projectId]);
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg).not.toHaveProperty('tier');
      // И не спрятан внутри вложенных структур.
      expect(JSON.stringify(cfg)).not.toContain('paid');
      expect(JSON.stringify(cfg)).not.toContain('free');
    });
  });

  it('ответ содержит РОВНО поля контракта — ничего лишнего не подтекает', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      // free: плюс badge_url (FR-GROWTH-003) — куда ведёт badge.
      expect(Object.keys(await buildWidgetConfig(c, slug)).sort()).toEqual([
        'badge_required', 'badge_url', 'project_slug', 'testimonials',
      ]);
      // paid: badge не рисуется, значит и ссылка не нужна и не отдаётся.
      await c.query("update projects set tier = 'paid', paid_until = now() + interval '30 days' where id = $1", [projectId]);
      expect(Object.keys(await buildWidgetConfig(c, slug)).sort()).toEqual([
        'badge_required', 'project_slug', 'testimonials',
      ]);
    });
  });

  it('среди аргументов нет НИ ОДНОГО, которым клиент переопределил бы badge', () => {
    // Проверяем ИМЕНА параметров, а не их количество: счётчик ломается при любом
    // безобидном расширении (так и вышло, когда добавился domain), а смысл проверки —
    // «нет входа для hide_badge/tier», и он именами и выражается.
    const params = buildWidgetConfig
      .toString()
      .slice(buildWidgetConfig.toString().indexOf('(') + 1)
      .split(')')[0]!
      .split(',')
      .map((p) => p.trim().split(/[:=\s]/)[0])
      .filter(Boolean);
    expect(params).toEqual(['client', 'slug', 'domain']);
    for (const forbidden of ['tier', 'badge', 'badgeRequired', 'hideBadge', 'hide_badge']) {
      expect(params, forbidden).not.toContain(forbidden);
    }
  });
});

describe('безопасный дефолт (Pseudocode §5.1)', () => {
  it('неизвестный слаг → пустой список и badge_required = true, а НЕ 404', async () => {
    await inRollback(async (c) => {
      const cfg = await buildWidgetConfig(c, 'no-such-project-at-all');
      expect(cfg).toMatchObject({
        testimonials: [],
        badge_required: true,
        project_slug: 'no-such-project-at-all',
      });
      // Даже у несуществующего проекта badge обязателен, а значит нужна и ссылка.
      expect(cfg.badge_url).toBeTruthy();
    });
  });

  it('деактивированный проект → тот же безопасный дефолт', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query("update projects set tier = 'paid', paid_until = now() + interval '30 days', deactivated = true where id = $1", [projectId]);
      const cfg = await buildWidgetConfig(c, slug);
      // Даже у ОПЛАЧЕННОГО проекта: не смогли проверить — значит badge обязателен.
      expect(cfg.badge_required).toBe(true);
      expect(cfg.testimonials).toEqual([]);
    });
  });

  it('safeDefault всегда требует badge — самый строгий вариант при неопределённости', () => {
    expect(safeDefault('любой').badge_required).toBe(true);
  });
});

describe('выборка отзывов для виджета', () => {
  it('только approved и только своего проекта', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      await addApproved(c, a.projectId, 'мой одобренный');
      await addApproved(c, b.projectId, 'чужой одобренный');
      await c.query(
        `insert into testimonials (project_id, author_name, text, status)
         values ($1, 'А', 'мой на проверке', 'pending')`,
        [a.projectId],
      );

      const cfg = await buildWidgetConfig(c, a.slug);
      expect(cfg.testimonials.map((t) => t.text)).toEqual(['мой одобренный']);
    });
  });

  it(`ограничение ${TESTIMONIAL_LIMIT} штук соблюдается`, async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      for (let i = 0; i < TESTIMONIAL_LIMIT + 5; i += 1) {
        await addApproved(c, projectId, `отзыв ${i}`);
      }
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.testimonials).toHaveLength(TESTIMONIAL_LIMIT);
    });
  });

  it('текст отдаётся ПОБАЙТОВО — экранирует виджет при рендере, не сервер', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      const payload = '<script>alert(1)</script> & <b>x</b>';
      await addApproved(c, projectId, payload);
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.testimonials[0]!.text).toBe(payload);
    });
  });

  it('transcript_source = null, пока транскрипта нет', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await addApproved(c, projectId, 'текстовый отзыв');
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.testimonials[0]!.transcript).toBeNull();
      expect(cfg.testimonials[0]!.transcript_source).toBeNull();
    });
  });

  it('у видео с готовой расшифровкой transcript_source = machine', async () => {
    await inRollback(async (c) => {
      const { slug, projectId } = await makeProject(c);
      await c.query(
        `insert into testimonials
           (project_id, author_name, text, video_object_key, transcript, transcript_status, status)
         values ($1, 'Автор', '', 'k/v.webm', 'расшифровка', 'completed', 'approved')`,
        [projectId],
      );
      const cfg = await buildWidgetConfig(c, slug);
      expect(cfg.testimonials[0]!.transcript).toBe('расшифровка');
      expect(cfg.testimonials[0]!.transcript_source).toBe('machine');
    });
  });
});
