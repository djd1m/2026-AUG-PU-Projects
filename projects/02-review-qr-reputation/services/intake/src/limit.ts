// Вторая и третья ступени лимита — скользящее окно в БД.
//
// Почему НЕ в памяти: эти ступени обещают ЧИСЛО («10 с адреса в час на точку»), а счётчик
// в памяти числа не обещает — не переживает рестарт и умножается на реплики. Грубый барьер
// обещает другое (поток не доедет до дорогой работы) и потому живёт в памяти.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПОЧЕМУ ЗДЕСЬ ADVISORY-ЛОК, А НЕ «ОДИН УМНЫЙ ЗАПРОС». Первая редакция считала и
// вставляла одним CTE и полагала, что атомарность даёт СУБД. Это неверно: под
// READ COMMITTED каждый одновременный оператор видит СВОЙ снимок — незакоммиченные
// вставки соседей в счёт не попадают, и 20 параллельных запросов прошли 14 при пороге 10.
// Один оператор ≠ сериализация. Поймано конкурентным тестом; последовательный зеленел.
//
// Лок — TRY, а не ждущий: очередь за локом держит соединения пула, и шторм по одному
// ключу исчерпал бы пул, общий с приёмом и доставкой. Занятый лок = параллельный поток
// по этому же ключу = законный повод отказать сразу. Тот же выбор, что в проекте 01.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from './db.js';

export const SCOPE_IP_PLACE = 'private_ip_place';
export const SCOPE_PLACE = 'private_place';
export const LIMIT_IP_PLACE = 10;
export const LIMIT_PLACE = 100;

/** Пространство имён локов этой фичи — чтобы не столкнуться с чужими в той же базе. */
const LOCK_NS = 42_002;

// ─────────────────────────────────────────────────────────────────────────────
// ОЧЕРЕДЬ ПО КЛЮЧУ — В ПАМЯТИ, ДО ВЗЯТИЯ СОЕДИНЕНИЯ (2026-09-28).
//
// Один TRY-лок давал ЛОЖНЫЕ отказы: два одновременных гостя одной точки сталкивались на
// ключе `private_place|<place>` и второй получал 429, хотя потолок точки (100) не исчерпан;
// двадцать одновременных с одного адреса проходили не «ровно 10», а сколько повезёт. Пока
// адрес гостя не доезжал до intake (все шли одним ключом), это было не видно.
//
// Ждущий лок в БД вернул бы исчерпание пула. Поэтому ждут здесь: промис-цепочка на ключ,
// соединение пула берётся ТОЛЬКО когда подошла очередь. Ожидающий держит сокет и память, а
// не соединение — число занятых соединений не растёт с числом ожидающих (C-2). Очередь
// ограничена (MAX_WAITERS_PER_KEY): сверх предела — отказ сразу, как было с занятым локом.
// TRY-лок в БД остаётся — он сериализует РАЗНЫЕ процессы (реплики), которые эта очередь
// не видит.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_WAITERS_PER_KEY = 64;
const tails = new Map<string, Promise<void>>();
const waiting = new Map<string, number>();

function serialized<T>(k: string, fn: () => Promise<T>): Promise<T> | null {
  const n = waiting.get(k) ?? 0;
  if (n >= MAX_WAITERS_PER_KEY) return null;
  waiting.set(k, n + 1);
  const prev = tails.get(k) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  tails.set(k, prev.then(() => mine));
  return prev.then(fn).finally(() => {
    release();
    const m = (waiting.get(k) ?? 1) - 1;
    // Никто не встал после нас — хвост цепочки наш, ключ удаляется: словарь не растёт.
    if (m === 0) { waiting.delete(k); tails.delete(k); } else waiting.set(k, m);
  });
}

export async function consume(scope: string, key: string, limitN: number): Promise<boolean> {
  const queued = serialized(`${scope}|${key}`, () => consumeOnce(scope, key, limitN));
  return queued === null ? false : queued;
}

async function consumeOnce(scope: string, key: string, limitN: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // hashtext даёт 32 бита; двухаргументная форма с константой пространства расширяет
    // до 64 и делает коллизию пренебрежимой. Коллизия не обходит лимит — COUNT ниже
    // фильтрует по полному ключу; она лишь сериализует две несвязанные попытки.
    const lock = await client.query<{ ok: boolean }>(
      'select pg_try_advisory_xact_lock($1, hashtext($2)) as ok', [LOCK_NS, `${scope}|${key}`]);
    if (!lock.rows[0]?.ok) { await client.query('rollback'); return false; }

    const { rows } = await client.query<{ n: string }>(
      `select count(*) as n from rate_limit_events
        where scope = $1 and key = $2 and created_at > now() - interval '1 hour'`,
      [scope, key]);
    if (Number(rows[0]?.n ?? 0) >= limitN) { await client.query('commit'); return false; }

    await client.query('insert into rate_limit_events (scope, key) values ($1, $2)', [scope, key]);
    await client.query('commit');
    return true;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
