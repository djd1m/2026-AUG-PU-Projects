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

export async function consume(scope: string, key: string, limitN: number): Promise<boolean> {
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
