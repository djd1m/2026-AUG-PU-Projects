// Доставка: двойная отправка, порядок пометки, усечение, ретраи.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL_NOTIFY = process.env.TEST_DATABASE_URL ?? '';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';

const { pool, closePool } = await import('../src/db.js');
const { claimBatch, tick } = await import('../src/worker.js');
const { formatMessage, CHANNEL_LIMIT } = await import('../src/format.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

const SLUG = `nt-${process.pid}`;
let placeId = '';

beforeAll(async () => {
  await pgAdmin.query(`insert into accounts (id,name) values ('55555555-5555-5555-5555-555555555555','N') on conflict do nothing`);
  const { rows } = await pgAdmin.query<{ id: string }>(
    `insert into places (account_id,slug,name) values ('55555555-5555-5555-5555-555555555555',$1,'Бар «Полка»') returning id`, [SLUG]);
  placeId = rows[0]!.id;
  await pgAdmin.query(
    `insert into channel_bindings (place_id,channel,chat_id,bind_token_hash,bound_at)
     values ($1,'telegram','chat-1','\\x00'::bytea, now())`, [placeId]);
});
afterAll(async () => {
  await pgAdmin.query('delete from places where slug=$1', [SLUG]);
  await pgAdmin.end(); await closePool();
});

async function queue(body = 'обычное сообщение гостя'): Promise<string> {
  const { rows } = await pgAdmin.query<{ id: string }>(
    `insert into private_feedback (place_id, body) values ($1,$2) returning id`, [placeId, body]);
  const pf = rows[0]!.id;
  await pgAdmin.query(`insert into notifications (private_feedback_id, channel) values ($1,'telegram')`, [pf]);
  return pf;
}

describe('двойная доставка — главный риск', () => {
  it('два воркера делят пачку, а не ждут друг друга', async () => {
    // ДЕСЯТЬ строк, а не одна. На одной различия НЕТ: без SKIP LOCKED второй воркер не
    // дублирует, он БЛОКИРУЕТСЯ до коммита первого и потом видит уже sending — то есть
    // возвращает ноль, и тест зеленеет на дефекте. Первая редакция этого не различала.
    for (let i = 0; i < 10; i++) await queue(`пачка ${i}`);
    const t0 = Date.now();
    const [a, b] = await Promise.all([claimBatch(5), claimBatch(5)]);
    const ms = Date.now() - t0;

    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size, 'одна строка выдана дважды').toBe(ids.length);
    // Оба получили работу: без SKIP LOCKED один ушёл бы с пустыми руками, отстояв очередь.
    expect(a.length, 'первый воркер остался без работы').toBeGreaterThan(0);
    expect(b.length, 'второй воркер остался без работы — он ЖДАЛ, а не пропустил занятое').toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });

  it('SKIP LOCKED: занятая строка ПРОПУСКАЕТСЯ, а не ожидается', async () => {
    // ЧТО ЭТА МЕРА ДЕЛАЕТ НА САМОМ ДЕЛЕ. Разбор при написании тестов показал: от ДУБЛЯ
    // защищает не она, а status='sending' — второй воркер и без пропуска блокировок
    // получил бы другие строки, просто отстояв очередь. SKIP LOCKED защищает от ОЖИДАНИЯ:
    // без него воркер, наткнувшись на строку в работе соседа, встаёт и держит соединение
    // пула всё время чужой транзакции.
    //
    // Проверяется удержанием блокировки снаружи: с SKIP LOCKED выборка возвращается
    // мгновенно, без него — висит до отпускания.
    await queue('удерживаемая строка');
    const holder = await pgAdmin.connect();
    try {
      await holder.query('begin');
      await holder.query(
        `select n.id from notifications n join private_feedback pf on pf.id=n.private_feedback_id
          where pf.place_id=$1 and n.status='pending' for update`, [placeId]);

      const t0 = Date.now();
      const got = await claimBatch(10);
      const ms = Date.now() - t0;

      expect(ms, 'выборка ЖДАЛА чужую блокировку, удерживая соединение пула').toBeLessThan(1500);
      expect(got.length, 'занятая строка всё-таки взята — блокировка не сработала').toBe(0);
    } finally {
      await holder.query('rollback').catch(() => {});
      holder.release();
    }
  }, 15_000);

  it('status меняется на sending ДО внешнего вызова', async () => {
    await queue();
    let statusAtCall = '';
    await tick(async () => {
      const { rows } = await pgAdmin.query<{ status: string }>(
        `select n.status from notifications n join private_feedback pf on pf.id=n.private_feedback_id
          where pf.place_id=$1 order by n.created_at desc limit 1`, [placeId]);
      statusAtCall = rows[0]?.status ?? '';
      return { ok: true, retriable: false };
    });
    // Если пометка стоит ПОСЛЕ вызова, перезапуск воркера между отправкой и записью
    // пошлёт сообщение второй раз: строка так и осталась pending.
    expect(statusAtCall, 'на момент отправки строка ещё pending — дубль при перезапуске').toBe('sending');
  });

  it('уже доставленная строка повторно не берётся', async () => {
    await queue();
    await tick(async () => ({ ok: true, retriable: false }));
    const again = await claimBatch(10);
    expect(again.length).toBe(0);
  });
});

describe('ретраи: различаем свой сбой и чужой', () => {
  it('5xx возвращается в pending и будет повторён', async () => {
    await queue();
    await tick(async () => ({ ok: false, retriable: true, error: 'telegram 503' }));
    const { rows } = await pgAdmin.query<{ status: string; attempts: number }>(
      `select n.status, n.attempts from notifications n join private_feedback pf on pf.id=n.private_feedback_id
        where pf.place_id=$1 order by n.created_at desc limit 1`, [placeId]);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.attempts).toBe(1);
  });

  it('4xx — сразу failed: повтор не поможет, а очередь засорит', async () => {
    await queue();
    await tick(async () => ({ ok: false, retriable: false, error: 'telegram 403' }));
    const { rows } = await pgAdmin.query<{ status: string }>(
      `select n.status from notifications n join private_feedback pf on pf.id=n.private_feedback_id
        where pf.place_id=$1 order by n.created_at desc limit 1`, [placeId]);
    expect(rows[0]?.status).toBe('failed');
  });

  it('непривязанный мессенджер — failed, а не бесконечный ретрай', async () => {
    const { rows: pr } = await pgAdmin.query<{ id: string }>(
      `insert into places (account_id,slug,name) values ('55555555-5555-5555-5555-555555555555',$1,'Без привязки') returning id`,
      [`${SLUG}-nb`]);
    const { rows } = await pgAdmin.query<{ id: string }>(
      `insert into private_feedback (place_id, body) values ($1,'текст') returning id`, [pr[0]!.id]);
    await pgAdmin.query(`insert into notifications (private_feedback_id, channel) values ($1,'telegram')`, [rows[0]!.id]);
    await tick(async () => ({ ok: true, retriable: false }));
    const { rows: n } = await pgAdmin.query<{ status: string; last_error: string }>(
      `select status, last_error from notifications where private_feedback_id=$1`, [rows[0]!.id]);
    expect(n[0]?.status).toBe('failed');
    expect(n[0]?.last_error).toBe('channel_not_bound');
    await pgAdmin.query('delete from places where slug=$1', [`${SLUG}-nb`]);
  });
});

describe('усечение — только видимое', () => {
  it('обычный текст уходит целиком и без пометки', () => {
    const r = formatMessage({ body: 'короткий отзыв', rating: 5, contact: null, placeName: 'Бар' }, 4096);
    expect(r.truncated).toBe(false);
    expect(r.text).toContain('короткий отзыв');
    expect(r.text).toContain('Оценка: 5 из 5');
  });

  it('текст в 2000 знаков помещается в Telegram целиком', () => {
    const r = formatMessage({ body: 'я'.repeat(2000), rating: null, contact: null, placeName: 'Бар' },
      CHANNEL_LIMIT.telegram!);
    // Предел тела выбран так, чтобы вопрос усечения не возникал вовсе.
    expect(r.truncated).toBe(false);
  });

  it('если усечение всё же случилось — оно ВИДИМО', () => {
    const r = formatMessage({ body: 'я'.repeat(5000), rating: null, contact: null, placeName: 'Бар' }, 500);
    expect(r.truncated).toBe(true);
    // Молчаливое усечение — тот же класс, что тихий дефолт: владелец прочтёт не то,
    // что написал гость, и НЕ УЗНАЕТ об этом.
    // Пометка — единственное, что отличает видимое усечение от молчаливого.
    expect(r.text, 'усечение стало молчаливым: владелец прочтёт не то, что написал гость')
      .toContain('[показано не полностью]');
    expect(r.text.length).toBeLessThanOrEqual(500);
  });
});

describe('стражи по исходнику', () => {
  it('внешний вызов вне транзакции: claimBatch освобождает соединение до отправки', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
    const release = src.indexOf('client.release()');
    const send = src.indexOf('await send(');
    expect(release).toBeLessThan(send);
    // В функции захвата не должно быть ни одного внешнего вызова.
    const claim = src.slice(src.indexOf('export async function claimBatch'), src.indexOf('export async function markSent'));
    expect(claim).not.toMatch(/fetch\(|await send/);
  });

  it('у отправки задан таймаут', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/deliver.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/signal:\s*AbortSignal\.timeout\(/);
  });
});


describe('deliver: свой сбой отличается от чужого — проверяется НА САМОМ КЛИЕНТЕ', () => {
  // Тесты выше подают retriable напрямую в tick и потому НЕ проверяют логику deliver.ts:
  // мутация «считать всё ретраибельным» проходила мимо них зелёной. Здесь подменяется
  // fetch, и решение принимает настоящий код.
  const withFetch = async (impl: typeof fetch, fn: () => Promise<void>) => {
    const orig = globalThis.fetch; globalThis.fetch = impl;
    try { await fn(); } finally { globalThis.fetch = orig; }
  };

  it('5xx — ретраибельно: сбой чужой, повтор поможет', async () => {
    const { sendTelegram } = await import('../src/deliver.js');
    await withFetch((() => Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch,
      async () => {
        const r = await sendTelegram('c', 't', 'tok');
        expect(r.ok).toBe(false);
        expect(r.retriable).toBe(true);
      });
  });

  it('4xx — НЕ ретраибельно: бот заблокирован или chat_id неверен, повтор не поможет', async () => {
    const { sendTelegram } = await import('../src/deliver.js');
    await withFetch((() => Promise.resolve(new Response('', { status: 403 }))) as unknown as typeof fetch,
      async () => {
        const r = await sendTelegram('c', 't', 'tok');
        expect(r.ok).toBe(false);
        // Ретрай здесь засорил бы очередь навсегда: строка вечно в pending, а причина не уйдёт.
        expect(r.retriable, '4xx уходит в бесконечный ретрай').toBe(false);
      });
  });

  it('сетевой сбой — ретраибельно', async () => {
    const { sendTelegram } = await import('../src/deliver.js');
    await withFetch((() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch,
      async () => {
        const r = await sendTelegram('c', 't', 'tok');
        expect(r.retriable).toBe(true);
      });
  });
});
