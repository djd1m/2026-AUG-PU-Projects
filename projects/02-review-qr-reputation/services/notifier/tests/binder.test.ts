// Привязка Telegram: одноразовость токена, хеш вместо токена, гонка двойного /start.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';

process.env.DATABASE_URL_NOTIFY = process.env.TEST_DATABASE_URL ?? '';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';

const { pool, closePool } = await import('../src/db.js');
const { pollBindings, resetOffsetForTests } = await import('../src/binder.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

const SLUG = `bd-${process.pid}`;
let placeId = '';

beforeEach(async () => {
  resetOffsetForTests();
  await pgAdmin.query('delete from places where slug=$1', [SLUG]);
  await pgAdmin.query(`insert into accounts (id,name) values ('66666666-6666-6666-6666-666666666666','B') on conflict do nothing`);
  const { rows } = await pgAdmin.query<{ id: string }>(
    `insert into places (account_id,slug,name) values ('66666666-6666-6666-6666-666666666666',$1,'Бинд') returning id`, [SLUG]);
  placeId = rows[0]!.id;
});
afterAll(async () => {
  await pgAdmin.query('delete from places where slug=$1', [SLUG]);
  await pgAdmin.end(); await closePool();
});

function seedToken(): string {
  return randomBytes(24).toString('base64url');
}
/** Выдача НОВОГО токена кабинетом — ровно так, как это делает server.ts после починки:
 *  хеш перезаписывается, действующая привязка НЕ трогается. */
async function reissue(token: string): Promise<void> {
  await pgAdmin.query(
    `insert into channel_bindings (place_id, channel, bind_token_hash) values ($1,'telegram',$2)
     on conflict (place_id, channel) do update set bind_token_hash=$2`,
    [placeId, createHash('sha256').update(token).digest()]);
}
async function storeHash(token: string): Promise<void> {
  await pgAdmin.query(
    `insert into channel_bindings (place_id, channel, bind_token_hash) values ($1,'telegram',$2)
     on conflict (place_id, channel) do update set bind_token_hash=$2, chat_id=null, bound_at=null`,
    [placeId, createHash('sha256').update(token).digest()]);
}
function tgFetch(updates: unknown[]): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).includes('getUpdates')) return Response.json({ ok: true, result: updates });
    return Response.json({ ok: true });
  }) as typeof fetch;
}
const upd = (id: number, text: string, chat = 777) => ({ update_id: id, message: { text, chat: { id: chat } } });

describe('привязка', () => {
  it('валидный /start привязывает чат и подтверждает', async () => {
    const t = seedToken(); await storeHash(t);
    const sent: string[] = [];
    const n = await pollBindings(async (_c, text) => { sent.push(text); return { ok: true, retriable: false }; },
      tgFetch([upd(1, `/start ${t}`)]));
    expect(n).toBe(1);
    const { rows } = await pgAdmin.query<{ chat_id: string; bound_at: Date }>(
      'select chat_id, bound_at from channel_bindings where place_id=$1', [placeId]);
    expect(rows[0]?.chat_id).toBe('777');
    expect(rows[0]?.bound_at).toBeTruthy();
    expect(sent[0]).toMatch(/Готово/);
  });

  it('токен ОДНОРАЗОВЫЙ: второй /start с тем же токеном получает «устарела»', async () => {
    const t = seedToken(); await storeHash(t);
    const sent: string[] = [];
    await pollBindings(async (_c, text) => { sent.push(text); return { ok: true, retriable: false }; },
      tgFetch([upd(1, `/start ${t}`), upd(2, `/start ${t}`, 999)]));
    const { rows } = await pgAdmin.query<{ chat_id: string }>(
      'select chat_id from channel_bindings where place_id=$1', [placeId]);
    // Первый победил, второй НЕ перехватил чужую привязку.
    expect(rows[0]?.chat_id).toBe('777');
    expect(sent[1]).toMatch(/устарела/i);
  });

  it('выдача нового токена НЕ рвёт действующую доставку, перепривязка — по УСПЕХУ', async () => {
    // Главный дефект этой фичи и его починка целиком. Владелец нажал «уведомления» ещё раз —
    // прежняя редакция обнуляла chat_id прямо там, и уведомления умирали молча, ещё до того
    // как кто-нибудь открыл диплинк. Теперь у смены привязки есть ровно один момент: успешный
    // /start по свежему токену.
    const t1 = seedToken(); await storeHash(t1);
    await pollBindings(async () => ({ ok: true, retriable: false }), tgFetch([upd(1, `/start ${t1}`)]));

    const t2 = seedToken(); await reissue(t2);          // кабинет выдал свежую кнопку
    let { rows } = await pgAdmin.query<{ chat_id: string | null }>(
      'select chat_id from channel_bindings where place_id=$1', [placeId]);
    expect(rows[0]?.chat_id, 'доставка обязана идти по прежнему чату, пока новый не подтверждён').toBe('777');

    // По старому токену уже не пройти: успешная привязка сожгла его хеш.
    expect(await pollBindings(async () => ({ ok: true, retriable: false }),
      tgFetch([upd(2, `/start ${t1}`, 888)]))).toBe(0);
    ({ rows } = await pgAdmin.query('select chat_id from channel_bindings where place_id=$1', [placeId]));
    expect(rows[0]?.chat_id).toBe('777');

    // А по свежему — проходит, и вот теперь чат меняется.
    expect(await pollBindings(async () => ({ ok: true, retriable: false }),
      tgFetch([upd(3, `/start ${t2}`, 888)]))).toBe(1);
    ({ rows } = await pgAdmin.query('select chat_id from channel_bindings where place_id=$1', [placeId]));
    expect(rows[0]?.chat_id).toBe('888');
  });

  it('успешная привязка СЖИГАЕТ хеш: в таблице его больше нет', async () => {
    const t = seedToken(); await storeHash(t);
    await pollBindings(async () => ({ ok: true, retriable: false }), tgFetch([upd(1, `/start ${t}`)]));
    const { rows } = await pgAdmin.query<{ h: Buffer }>(
      'select bind_token_hash as h from channel_bindings where place_id=$1', [placeId]);
    expect(rows[0]!.h.toString('hex')).not.toBe(createHash('sha256').update(t).digest('hex'));
    expect(rows[0]!.h.length, 'место хеша занимают 32 случайных байта, а не NULL').toBe(32);
  });

  it('неизвестный токен не привязывает ничего', async () => {
    await storeHash(seedToken());
    const n = await pollBindings(async () => ({ ok: true, retriable: false }),
      tgFetch([upd(1, `/start ${seedToken()}`)]));
    expect(n).toBe(0);
    const { rows } = await pgAdmin.query<{ chat_id: string | null }>(
      'select chat_id from channel_bindings where place_id=$1', [placeId]);
    expect(rows[0]?.chat_id).toBeNull();
  });

  it('перегенерация токена убивает старый диплинк', async () => {
    const t1 = seedToken(); await storeHash(t1);
    const t2 = seedToken(); await storeHash(t2);   // кабинет перегенерировал
    const n = await pollBindings(async () => ({ ok: true, retriable: false }),
      tgFetch([upd(1, `/start ${t1}`)]));
    expect(n).toBe(0);
  });

  it('в БД нет токена в открытую — только хеш', async () => {
    const t = seedToken(); await storeHash(t);
    const { rows } = await pgAdmin.query<{ h: Buffer }>(
      'select bind_token_hash as h from channel_bindings where place_id=$1', [placeId]);
    expect(rows[0]?.h.toString()).not.toContain(t);
    expect(rows[0]?.h.length).toBe(32);   // sha256, не сам токен
  });

  it('сбой сети getUpdates — тихий пропуск тика, offset не сдвинут', async () => {
    const n = await pollBindings(async () => ({ ok: true, retriable: false }),
      (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch);
    expect(n).toBe(0);
  });

  it('без TELEGRAM_BOT_TOKEN привязка спит, а не падает', async () => {
    const save = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = '';
    try { expect(await pollBindings()).toBe(0); }
    finally { process.env.TELEGRAM_BOT_TOKEN = save; }
  });
});
