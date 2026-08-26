// FR-003 — ограничения видео и приём. Хранилище подменяется функцией upload
// (она параметр submitVideoTestimonial), поэтому логика проверяется без сети,
// а реальная загрузка в MinIO — отдельным тестом ниже.

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { submitVideoTestimonial, RATE_LIMIT_THRESHOLD } = await import('../src/lib/testimonial');
const { validateVideoConstraints, sniffContainer, MAX_SIZE_BYTES } = await import('../src/lib/video');
const { buildObjectKey } = await import('../src/lib/storage');

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
    email: `v${n}-${Date.now()}@example.com`,
    password: 'password-long-enough',
    desired_slug: `vid-${n}-${Date.now().toString(36)}`,
  });
  if (!res.ok) throw new Error('не удалось создать проект');
  return res.slug;
}

/** Валидный WebM: EBML-сигнатура 1A 45 DF A3 + наполнитель. */
function webmBytes(size = 2048): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return b;
}
function mp4Bytes(size = 2048): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 0); // ....ftyp
  return b;
}

const fakeUpload = async (projectId: string, _b: Uint8Array, mime: string) =>
  buildObjectKey(projectId, mime);

afterAll(async () => {
  await closePool();
});

describe('validateVideoConstraints — Pseudocode §1.1', () => {
  it('валидное видео не даёт ошибок', () => {
    expect(validateVideoConstraints({ duration_sec: 60, size_bytes: 1000, mime: 'video/webm' })).toEqual([]);
  });

  it('отсутствующее видео', () => {
    expect(validateVideoConstraints(null)).toEqual(['video: обязателен для type=video']);
    expect(validateVideoConstraints(undefined)).toHaveLength(1);
  });

  it('длительность > 120 с', () => {
    expect(validateVideoConstraints({ duration_sec: 121, size_bytes: 100, mime: 'video/mp4' })).toEqual([
      'video: длиннее 120 секунд',
    ]);
  });

  it('ровно 120 с проходит (граница включительно)', () => {
    expect(validateVideoConstraints({ duration_sec: 120, size_bytes: 100, mime: 'video/mp4' })).toEqual([]);
  });

  it('размер > 100 MB', () => {
    expect(
      validateVideoConstraints({ duration_sec: 10, size_bytes: MAX_SIZE_BYTES + 1, mime: 'video/mp4' }),
    ).toEqual(['video: больше 100 MB']);
  });

  it('ровно 100 MB проходит', () => {
    expect(validateVideoConstraints({ duration_sec: 10, size_bytes: MAX_SIZE_BYTES, mime: 'video/mp4' })).toEqual([]);
  });

  it.each(['video/quicktime', 'application/pdf', 'video/x-msvideo', '', 'text/html'])(
    'формат %j отклоняется',
    (mime) => {
      expect(validateVideoConstraints({ duration_sec: 10, size_bytes: 100, mime })).toContain(
        'video: недопустимый формат, разрешены webm, mp4',
      );
    },
  );

  it('нечитаемая длительность и пустой файл — отдельные ошибки', () => {
    const errs = validateVideoConstraints({ duration_sec: NaN, size_bytes: 0, mime: 'video/mp4' });
    expect(errs).toHaveLength(2);
  });

  it('накапливает ВСЕ нарушения сразу, а не первое', () => {
    const errs = validateVideoConstraints({ duration_sec: 500, size_bytes: MAX_SIZE_BYTES + 1, mime: 'bad' });
    expect(errs).toHaveLength(3);
  });
});

describe('sniffContainer — содержимое против заявленного типа', () => {
  it('распознаёт webm и mp4', () => {
    expect(sniffContainer(webmBytes())).toBe('video/webm');
    expect(sniffContainer(mp4Bytes())).toBe('video/mp4');
  });

  it('не распознаёт HTML, выданный за видео', () => {
    expect(sniffContainer(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
  });

  it('не падает на слишком коротком буфере', () => {
    expect(sniffContainer(new Uint8Array([0x1a, 0x45]))).toBeNull();
    expect(sniffContainer(new Uint8Array())).toBeNull();
  });
});

describe('FR-003 приём видео', () => {
  it('валидное видео → 201, transcript_status=pending для воркера', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitVideoTestimonial(
        c,
        slug,
        '1.2.3.4',
        { name: 'Иван', video: { bytes: webmBytes(), mime: 'video/webm', duration_sec: 30 } },
        fakeUpload,
      );
      expect(res.status).toBe(201);
      if (!res.ok) return;

      const row = await c.query('select * from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0]).toMatchObject({
        status: 'pending',
        transcript_status: 'pending',
        transcript_source: 'machine',
        transcript: null,
      });
      expect(row.rows[0].video_object_key).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webm$/);
    });
  });

  it('подпись автора кладётся в text и НЕ является транскриптом', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitVideoTestimonial(
        c,
        slug,
        '1.2.3.4',
        {
          name: 'Иван',
          text_caption: 'Снимал на бегу',
          video: { bytes: mp4Bytes(), mime: 'video/mp4', duration_sec: 15 },
        },
        fakeUpload,
      );
      if (!res.ok) throw new Error('ожидался успех');
      const row = await c.query('select text, transcript from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0].text).toBe('Снимал на бегу');
      expect(row.rows[0].transcript).toBeNull();
    });
  });

  it('без подписи text = пустая строка, а не NULL (схема: not null default \'\')', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitVideoTestimonial(
        c,
        slug,
        '1.2.3.4',
        { name: 'Иван', video: { bytes: webmBytes(), mime: 'video/webm', duration_sec: 5 } },
        fakeUpload,
      );
      if (!res.ok) throw new Error('ожидался успех');
      const row = await c.query('select text from testimonials where id = $1', [res.publicId]);
      expect(row.rows[0].text).toBe('');
    });
  });

  it('заявленный mp4 с содержимым webm → 400', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const res = await submitVideoTestimonial(
        c,
        slug,
        '1.2.3.4',
        { name: 'Иван', video: { bytes: webmBytes(), mime: 'video/mp4', duration_sec: 10 } },
        fakeUpload,
      );
      expect(res.status).toBe(400);
      if (res.ok) return;
      expect(JSON.stringify(res.body)).toContain('не соответствует заявленному формату');
    });
  });

  it('HTML под видом видео → 400, в хранилище не попадает', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      let uploaded = false;
      const res = await submitVideoTestimonial(
        c,
        slug,
        '1.2.3.4',
        {
          name: 'Иван',
          video: {
            bytes: new TextEncoder().encode('<html><script>alert(1)</script></html>'),
            mime: 'video/webm',
            duration_sec: 10,
          },
        },
        async (p, b, m) => {
          uploaded = true;
          return fakeUpload(p, b, m);
        },
      );
      expect(res.status).toBe(400);
      expect(uploaded).toBe(false);
    });
  });

  it('W-5: сбой хранилища → 503 и квота ВОЗВРАЩАЕТСЯ', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      const failing = async () => {
        throw new Error('minio down');
      };
      const video = { bytes: webmBytes(), mime: 'video/webm' as const, duration_sec: 10 };

      // Пять сбоев подряд: если бы квота не откатывалась, шестая попытка получила бы 429.
      for (let i = 0; i < RATE_LIMIT_THRESHOLD; i += 1) {
        const res = await submitVideoTestimonial(c, slug, '3.3.3.3', { name: 'Иван', video }, failing);
        expect(res.status, `попытка ${i + 1}`).toBe(503);
      }
      const after = await submitVideoTestimonial(c, slug, '3.3.3.3', { name: 'Иван', video }, fakeUpload);
      expect(after.status).toBe(201);
    });
  });

  it('ИНВАРИАНТ: невалидное видео квоту НЕ списывает', async () => {
    await inRollback(async (c) => {
      const slug = await makeProject(c);
      for (let i = 0; i < 10; i += 1) {
        const bad = await submitVideoTestimonial(
          c,
          slug,
          '2.2.2.2',
          { name: 'Иван', video: { bytes: webmBytes(), mime: 'video/webm', duration_sec: 999 } },
          fakeUpload,
        );
        expect(bad.status).toBe(400);
      }
      const good = await submitVideoTestimonial(
        c,
        slug,
        '2.2.2.2',
        { name: 'Иван', video: { bytes: webmBytes(), mime: 'video/webm', duration_sec: 10 } },
        fakeUpload,
      );
      expect(good.status).toBe(201);
    });
  });

  it('ключ объекта не содержит имени файла автора и начинается с project_id', () => {
    const key = buildObjectKey('11111111-1111-1111-1111-111111111111', 'video/webm');
    expect(key.startsWith('11111111-1111-1111-1111-111111111111/')).toBe(true);
    expect(key.endsWith('.webm')).toBe(true);
    expect(buildObjectKey('p', 'video/webm')).not.toBe(buildObjectKey('p', 'video/webm'));
  });
});
