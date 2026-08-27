// FR-002 на живой Postgres. Отдельное внимание — инварианту FR-NFR-SEC-002:
// приём сохраняет присланное ПОБАЙТОВО и ничего не санирует.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const {
  submitTextTestimonial,
  validateTextSubmission,
  rateLimitKey,
  RATE_LIMIT_THRESHOLD,
} = await import('../src/lib/testimonial');

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
  const res = await registerAccountAndProject(c, {
    email: `own${n}-${Date.now()}@example.com`,
    password: 'password-long-enough',
    desired_slug: `proj-${n}-${Date.now().toString(36)}`,
  });
  if (!res.ok) throw new Error('не удалось создать проект');
  return res.slug;
}

afterAll(async () => {
  await closePool();
});

describe('FR-002 приём текстового отзыва', () => {
  it('валидный отзыв → 201 pending, попадает в audit_log', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitTextTestimonial(c, slug, '1.2.3.4', {
        type: 'text',
        name: 'Иван Петров',
        role: 'CTO, Acme',
        text: 'Отличный сервис, всё работает как обещано.',
      });
      expect(res.status).toBe(201);
      if (!res.ok) return;

      const row = await c.query('select * from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0]).toMatchObject({
        status: 'pending',
        author_name: 'Иван Петров',
        author_role: 'CTO, Acme',
      });

      const audit = await c.query(
        "select action, actor_id from audit_log where entity_id = $1 and entity_type = 'testimonial'",
        [res.publicId],
      );
      expect(audit.rows[0]).toMatchObject({ action: 'testimonial_created', actor_id: 'public' });
    });
  });

  it('ИНВАРИАНТ FR-NFR-SEC-002: разметка сохраняется ПОБАЙТОВО, без санитизации', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const payload = '<script>alert(1)</script> и <img src=x onerror=alert(2)>';
      const name = '<b>Жирный</b> Аноним';
      const res = await submitTextTestimonial(c, slug, '1.2.3.4', {
        type: 'text',
        name,
        text: payload,
      });
      expect(res.status).toBe(201);
      if (!res.ok) return;

      const row = await c.query<{ text: string; author_name: string }>(
        'select text, author_name from testimonials where id = $1',
        [res.publicId],
      );
      // Именно равенство, а не "содержит": любое экранирование/вырезание провалит тест.
      expect(row.rows[0]!.text).toBe(payload);
      expect(row.rows[0]!.author_name).toBe(name);
    });
  });

  it('несуществующий слаг → 404 без утечки', async () => {
    await inRollback(async (c) => {
      const res = await submitTextTestimonial(c, 'no-such-project', '1.2.3.4', {
        type: 'text',
        name: 'Кто-то',
        text: 'Текст достаточной длины для проверки.',
      });
      expect(res.status).toBe(404);
    });
  });

  it('деактивированный проект тоже 404 — ответ не отличает его от отсутствующего', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      await c.query('update projects set deactivated = true where slug = $1', [slug]);
      const res = await submitTextTestimonial(c, slug, '1.2.3.4', {
        type: 'text',
        name: 'Кто-то',
        text: 'Текст достаточной длины для проверки.',
      });
      expect(res.status).toBe(404);
    });
  });
});

describe('FR-002 валидация границ', () => {
  it.each([
    ['имя короче 2', { type: 'text', name: 'И', text: 'нормальный текст отзыва' }],
    ['имя длиннее 80', { type: 'text', name: 'и'.repeat(81), text: 'нормальный текст отзыва' }],
    ['текст короче 10', { type: 'text', name: 'Иван', text: 'коротко' }],
    ['текст длиннее 2000', { type: 'text', name: 'Иван', text: 'т'.repeat(2001) }],
    ['type не text', { type: 'video', name: 'Иван', text: 'нормальный текст отзыва' }],
  ])('%s → 400', async (_label, input) => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitTextTestimonial(c, slug, '1.2.3.4', input);
      expect(res.status).toBe(400);
    });
  });

  it('граничные значения 2/80 и 10/2000 ПРОХОДЯТ', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      for (const [name, text] of [
        ['Ив', 'т'.repeat(10)],
        ['и'.repeat(80), 'т'.repeat(2000)],
      ] as const) {
        const res = await submitTextTestimonial(c, slug, `ip-${name.length}-${text.length}`, {
          type: 'text',
          name,
          text,
        });
        expect(res.status).toBe(201);
      }
    });
  });

  it('role необязателен и пустая строка кладётся как NULL', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitTextTestimonial(c, slug, '1.2.3.4', {
        type: 'text',
        name: 'Иван',
        text: 'нормальный текст отзыва',
        role: '   ',
      });
      if (!res.ok) throw new Error('ожидался успех');
      const row = await c.query('select author_role from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0].author_role).toBeNull();
    });
  });

  it('validateTextSubmission — чистая функция без побочных эффектов', () => {
    expect(validateTextSubmission({ type: 'text', name: 'Ив', text: 'т'.repeat(10) })).toEqual([]);
    expect(validateTextSubmission({ type: 'text', name: 'И', text: 'x' })).toHaveLength(2);
  });
});

describe('FR-002 rate limit — 5/час/IP на проект', () => {
  it('шестая отправка с того же IP → 429', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const body = { type: 'text', name: 'Иван', text: 'нормальный текст отзыва' };
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        const ok = await submitTextTestimonial(c, slug, '9.9.9.9', body);
        expect(ok.status, `отправка ${i + 1}`).toBe(201);
      }
      const blocked = await submitTextTestimonial(c, slug, '9.9.9.9', body);
      expect(blocked.status).toBe(429);
    });
  });

  it('лимит НЕ общий: другой IP на том же проекте проходит', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const body = { type: 'text', name: 'Иван', text: 'нормальный текст отзыва' };
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        await submitTextTestimonial(c, slug, '8.8.8.8', body);
      }
      expect((await submitTextTestimonial(c, slug, '8.8.8.8', body)).status).toBe(429);
      expect((await submitTextTestimonial(c, slug, '7.7.7.7', body)).status).toBe(201);
    });
  });

  it('лимит НЕ общий: тот же IP на другом проекте проходит', async () => {
    await inRollback(async (c) => {
      const a = await makeProject(c);
      const b = await makeProject(c);
      const body = { type: 'text', name: 'Иван', text: 'нормальный текст отзыва' };
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        await submitTextTestimonial(c, a, '6.6.6.6', body);
      }
      expect((await submitTextTestimonial(c, a, '6.6.6.6', body)).status).toBe(429);
      expect((await submitTextTestimonial(c, b, '6.6.6.6', body)).status).toBe(201);
    });
  });

  it('W-5: невалидная отправка НЕ списывает квоту', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      // Десять заведомо невалидных попыток — если бы квота списывалась, лимит бы исчерпался.
      for (let i = 0; i < 10; i += 1) {
        const bad = await submitTextTestimonial(c, slug, '5.5.5.5', { type: 'text', name: 'И', text: 'x' });
        expect(bad.status).toBe(400);
      }
      const good = await submitTextTestimonial(c, slug, '5.5.5.5', {
        type: 'text',
        name: 'Иван',
        text: 'нормальный текст отзыва',
      });
      expect(good.status).toBe(201);
    });
  });

  it('429 не раскрывает ни счётчик, ни время сброса (anti-enumeration)', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const body = { type: 'text', name: 'Иван', text: 'нормальный текст отзыва' };
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        await submitTextTestimonial(c, slug, '4.4.4.4', body);
      }
      const res = await submitTextTestimonial(c, slug, '4.4.4.4', body);
      expect(res.status).toBe(429);
      const serialized = JSON.stringify(res.ok ? {} : res.body);
      expect(serialized).not.toMatch(/\d/); // ни счётчика, ни секунд
    });
  });

  it('ключ лимита различает ip и project и не склеивает их конкатенацией', () => {
    expect(rateLimitKey('1.2', '3.4')).not.toBe(rateLimitKey('1.2.3', '.4'));
    expect(rateLimitKey('1.2.3.4', 'p1')).toBe(rateLimitKey('1.2.3.4', 'p1'));
    expect(rateLimitKey('1.2.3.4', 'p1')).not.toBe(rateLimitKey('1.2.3.4', 'p2'));
  });
});

// ─────────────────────── FR-002: фото к отзыву ───────────────────────

describe('FR-002 фото к текстовому отзыву', () => {
  const jpeg = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff], 0); return b; };
  const png = (n = 64) => {
    const b = new Uint8Array(n);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    return b;
  };
  const goodText = { type: 'text' as const, name: 'Иван', text: 'нормальный текст отзыва' };

  it('фото сохраняется, в колонке лежит путь НАШЕГО роута', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitTextTestimonial(
        c, slug, '1.1.1.1',
        { ...goodText, photo: { bytes: jpeg(), mime: 'image/jpeg' } },
        async (projectId, _b, mime) => `${projectId}/photo-key.${mime === 'image/jpeg' ? 'jpg' : 'png'}`,
      );
      expect(res.status).toBe(201);
      if (!res.ok) return;
      const row = await c.query('select photo_url from testimonials where id = $1', [res.publicId]);
      // Не адрес хранилища: прямая ссылка означала бы публичный бакет либо
      // presigned-ссылку, которая истекает.
      expect(row.rows[0].photo_url).toMatch(/^\/api\/photo\/[0-9a-f-]{36}\/photo-key\.jpg$/);
    });
  });

  it('без фото photo_url остаётся NULL', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitTextTestimonial(c, slug, '1.1.1.2', goodText, async () => 'k');
      if (!res.ok) throw new Error('ожидался успех');
      const row = await c.query('select photo_url from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0].photo_url).toBeNull();
    });
  });

  it('ИНВАРИАНТ: SVG под видом PNG отклоняется и в хранилище НЕ попадает', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      let uploaded = false;
      const res = await submitTextTestimonial(
        c, slug, '1.1.1.3',
        {
          ...goodText,
          photo: {
            bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
            mime: 'image/png',
          },
        },
        async () => { uploaded = true; return 'k'; },
      );
      expect(res.status).toBe(400);
      expect(uploaded).toBe(false);
    });
  });

  it('невалидное фото НЕ списывает квоту (W-5)', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const bad = { ...goodText, photo: { bytes: png(), mime: 'image/jpeg' } };
      for (let i = 0; i < 10; i += 1) {
        expect((await submitTextTestimonial(c, slug, '1.1.1.4', bad, async () => 'k')).status).toBe(400);
      }
      const good = await submitTextTestimonial(c, slug, '1.1.1.4', goodText, async () => 'k');
      expect(good.status).toBe(201);
    });
  });

  it('W-5: сбой хранилища фото → 503 и квота ВОЗВРАЩАЕТСЯ', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const withPhoto = { ...goodText, photo: { bytes: jpeg(), mime: 'image/jpeg' } };
      const failing = async () => { throw new Error('minio down'); };
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        expect((await submitTextTestimonial(c, slug, '1.1.1.5', withPhoto, failing)).status).toBe(503);
      }
      const after = await submitTextTestimonial(c, slug, '1.1.1.5', withPhoto, async () => 'ok/k.jpg');
      expect(after.status).toBe(201);
    });
  });

  it('текстовые поля при отправке с фото по-прежнему сохраняются побайтово', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const payload = '<script>alert(1)</script>';
      const res = await submitTextTestimonial(
        c, slug, '1.1.1.6',
        { type: 'text', name: 'Автор', text: payload, photo: { bytes: png(), mime: 'image/png' } },
        async () => 'p/k.png',
      );
      if (!res.ok) throw new Error('ожидался успех');
      const row = await c.query('select text from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0].text).toBe(payload);
    });
  });
});
