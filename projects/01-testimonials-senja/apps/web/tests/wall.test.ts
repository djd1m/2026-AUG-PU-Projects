// FR-005 — публичная стена. Главное здесь — safeJsonLd: это ЕДИНСТВЕННОЕ место
// приложения, где авторский текст попадает внутрь <script>, и React там не защищает.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { WallItem } from '../src/lib/wall';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, withAccount, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { submitTextTestimonial } = await import('../src/lib/testimonial');
const { applyTransition } = await import('../src/lib/moderation');
// Импорт ДИНАМИЧЕСКИЙ: статический был бы поднят выше присвоения DATABASE_URL,
// и пул в @proofwall/db создался бы без строки подключения (поймано этим же тестом).
const { getApprovedTestimonials, buildReviewJsonLd, safeJsonLd } = await import('../src/lib/wall');

const item = (over: Partial<WallItem> = {}): WallItem => ({
  id: 'id-1',
  author_name: 'Автор',
  author_role: null,
  text: 'обычный текст',
  transcript: null,
  has_video: false,
  source_platform: null,
  source_url: null,
  screenshot_object_key: null,
  source: 'form',
  photo_url: null,
  created_at: '2026-08-26T10:00:00.000Z',
  ...over,
});

afterAll(async () => {
  await closePool();
});

describe('safeJsonLd — выход из <script> невозможен', () => {
  it('ИНВАРИАНТ: в выводе не остаётся ни одной литеральной угловой скобки', () => {
    const payload = '</script><script>alert(1)</script>';
    const out = safeJsonLd(buildReviewJsonLd('acme', 'https://x/w/acme', [item({ text: payload })]));
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
  });

  it('JSON.stringify сам по себе НЕ спасает — это и есть причина существования функции', () => {
    const payload = '</script>';
    // Демонстрация проблемы: голая сериализация оставляет тег закрывающимся.
    expect(JSON.stringify({ t: payload })).toContain('</script>');
    expect(safeJsonLd({ t: payload })).not.toContain('</script>');
  });

  it('экранирует & — иначе HTML-сущности внутри JSON интерпретируются парсером', () => {
    expect(safeJsonLd({ t: 'a & b' })).toContain('\\u0026');
    expect(safeJsonLd({ t: 'a & b' })).not.toContain(' & ');
  });

  it('экранирует U+2028/U+2029 — валидны в JSON, но рвут JS-парсер', () => {
    const out = safeJsonLd({ t: 'a b c' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toContain(' ');
    expect(out).not.toContain(' ');
  });

  it('результат остаётся ВАЛИДНЫМ JSON и данные не искажены', () => {
    const payload = '</script><img src=x onerror=alert(1)> & "кавычки"   конец';
    const parsed = JSON.parse(safeJsonLd({ t: payload })) as { t: string };
    // Экранирование не должно менять сами данные — иначе поисковик получит мусор.
    expect(parsed.t).toBe(payload);
  });

  it('имя автора экранируется так же, как текст', () => {
    const out = safeJsonLd(
      buildReviewJsonLd('acme', 'https://x/w/acme', [item({ author_name: '</script>злой' })]),
    );
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toBeTruthy();
  });
});

describe('buildReviewJsonLd — разметка schema.org/Review', () => {
  it('строит ItemList с Review внутри и корректными позициями', () => {
    const ld = buildReviewJsonLd('acme', 'https://x/w/acme', [
      item({ id: 'a', text: 'первый' }),
      item({ id: 'b', text: 'второй' }),
    ]) as any;
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('ItemList');
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[1].position).toBe(2);
    expect(ld.itemListElement[0].item['@type']).toBe('Review');
    expect(ld.itemListElement[0].item.reviewBody).toBe('первый');
  });

  it('роль автора попадает в jobTitle, а её отсутствие не создаёт пустого поля', () => {
    const withRole = buildReviewJsonLd('a', 'u', [item({ author_role: 'CTO' })]) as any;
    const without = buildReviewJsonLd('a', 'u', [item({ author_role: null })]) as any;
    expect(withRole.itemListElement[0].item.author.jobTitle).toBe('CTO');
    expect(without.itemListElement[0].item.author).not.toHaveProperty('jobTitle');
  });

  it('ТРАНСКРИПТ не попадает в reviewBody — это расшифровка речи, а не отзыв автора', () => {
    const ld = buildReviewJsonLd('a', 'u', [
      item({ text: 'подпись автора', transcript: 'расшифровка речи', has_video: true }),
    ]) as any;
    expect(ld.itemListElement[0].item.reviewBody).toBe('подпись автора');
    expect(JSON.stringify(ld)).not.toContain('расшифровка речи');
  });

  it('datePublished — дата без времени', () => {
    const ld = buildReviewJsonLd('a', 'u', [item()]) as any;
    expect(ld.itemListElement[0].item.datePublished).toBe('2026-08-26');
  });
});

describe('getApprovedTestimonials — инвариант «только approved публичен»', () => {
  it('отдаёт только одобренные и только своего проекта', async () => {
    let n = Date.now().toString(36);
    const setup = await withService(async (c: PoolClient) => {
      const own = await registerAccountAndProject(c, {
        email: `wall-${n}@example.com`,
        password: 'password-long-enough',
        desired_slug: `wall-${n}`,
      });
      if (!own.ok) throw new Error('регистрация');
      const other = await registerAccountAndProject(c, {
        email: `wall2-${n}@example.com`,
        password: 'password-long-enough',
        desired_slug: `wall2-${n}`,
      });
      if (!other.ok) throw new Error('регистрация 2');

      const mine: string[] = [];
      for (const t of ['первый отзыв длиннее десяти', 'второй отзыв длиннее десяти']) {
        const s = await submitTextTestimonial(c, own.slug, `ip-${t.length}-${n}`, {
          type: 'text',
          name: 'Автор',
          text: t,
        });
        if (!s.ok) throw new Error('отзыв');
        mine.push(s.publicId);
      }
      // Чужой проект — свой отзыв, тоже будет одобрен.
      const foreign = await submitTextTestimonial(c, other.slug, `ipf-${n}`, {
        type: 'text',
        name: 'Чужой',
        text: 'чужой отзыв длиннее десяти',
      });
      if (!foreign.ok) throw new Error('чужой отзыв');

      const { rows } = await c.query('select id from projects where slug = $1', [own.slug]);
      return { own, other, mine, foreignId: foreign.publicId, projectId: rows[0].id };
    });

    // Ничего не одобрено — стена пуста.
    expect(await getApprovedTestimonials(setup.projectId)).toHaveLength(0);

    // Одобряем ОДИН свой и чужой.
    await withAccount(setup.own.accountId, (c) =>
      applyTransition(c, setup.mine[0]!, 'pending', 'approved', setup.own.accountId),
    );
    await withAccount(setup.other.accountId, (c) =>
      applyTransition(c, setup.foreignId, 'pending', 'approved', setup.other.accountId),
    );

    const visible = await getApprovedTestimonials(setup.projectId);
    expect(visible.map((v) => v.id)).toEqual([setup.mine[0]]);
  });

  it('текст отдаётся ПОБАЙТОВО — стена получает то же, что приняла форма', async () => {
    const n = Date.now().toString(36) + 'x';
    const payload = '<script>alert(1)</script> & <b>жирный</b>';
    const setup = await withService(async (c: PoolClient) => {
      const own = await registerAccountAndProject(c, {
        email: `raw-${n}@example.com`,
        password: 'password-long-enough',
        desired_slug: `raw-${n}`,
      });
      if (!own.ok) throw new Error('регистрация');
      const s = await submitTextTestimonial(c, own.slug, `ip-raw-${n}`, {
        type: 'text',
        name: 'Автор',
        text: payload,
      });
      if (!s.ok) throw new Error('отзыв');
      const { rows } = await c.query('select id from projects where slug = $1', [own.slug]);
      return { accountId: own.accountId, id: s.publicId, projectId: rows[0].id };
    });

    await withAccount(setup.accountId, (c) =>
      applyTransition(c, setup.id, 'pending', 'approved', setup.accountId),
    );

    const visible = await getApprovedTestimonials(setup.projectId);
    // Данные не тронуты — безопасной их делает РЕНДЕР, а не хранилище.
    expect(visible[0]!.text).toBe(payload);
    // А в JSON-LD этот же текст уже не может закрыть тег.
    expect(safeJsonLd(buildReviewJsonLd('s', 'u', visible))).not.toContain('<script>');
  });
});


describe('Демонстрационные отзывы помечены — FTC 16 CFR Part 465', () => {
  // Сочинённый отзыв, выданный за настоящий, карается штрафом до $53 088. Пометка живёт
  // в ДАННЫХ (source='demo', миграция 016), а не в слаге проекта: убрали демо-строки —
  // отметка исчезла сама; завели демо в другом проекте — появилась там же.
  const read = (rel: string) =>
    readFileSync(path.resolve(__dirname, '../src', rel), 'utf8');

  it('страница стены показывает отметку, когда среди отзывов есть демо', () => {
    const code = read('app/w/[slug]/page.tsx');
    expect(code).toMatch(/items\.some\(\(t\) => t\.source === 'demo'\)/);
    expect(code).toMatch(/не принадлежат реальным людям/);
  });

  it('запрос стены отдаёт source — иначе отметить нечем', () => {
    expect(read('lib/wall.ts')).toMatch(/select id, author_name, author_role, text, transcript, photo_url, source/);
  });

  it('схема допускает demo как отдельный источник, а не подменяет им form', async () => {
    const { rows } = await withService((c) => c.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname='testimonials_source_check'"));
    expect(rows[0]?.def).toContain("'demo'");
    expect(rows[0]?.def).toContain("'form'");
  });
});
