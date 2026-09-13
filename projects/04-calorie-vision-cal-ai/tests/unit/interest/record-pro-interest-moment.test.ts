// RV-pro-interest-and-limits-ui-01 (правка после ревью, `docs/features/pro-interest-and-limits-ui/review-report.md`).
//
// До правки `day` вычислялся часами ПРИЛОЖЕНИЯ в `routes/interest.ts` — ДО открытия
// транзакции, то есть ДО `pool.connect()`, который может ждать свободное соединение.
// Два запроса, вычислившие «вчера» перед московской полуночью и дождавшиеся соединения
// уже ПОСЛЕ неё, оба видели один и тот же устаревший `day`, а `created_at` вставки получал
// НЕЗАВИСИМЫЙ `DEFAULT now()` СУБД — advisory-lock сериализовал операции, но не исправлял
// неверный день поиска, и обе строки проходили cadence-проверку.
//
// Реальный переход полуночи на настоящем PostgreSQL не воспроизводим детерминированным
// unit-тестом без внешних средств подмены системных часов СУБД — этот тест проверяет
// СВОЙСТВО исправления на уровне вызовов SQL: часы приложения (`vi.useFakeTimers`)
// намеренно отведены НАЗАД, на «до полуночи», а фейковый пул возвращает единственный
// результат «момента» с днём «после полуночи» — и тест доказывает, что РОВНО этот
// результат, а не часы приложения, используется для лока, cadence-проверки и `created_at`.
// Реальная атомарность самой блокировки проверяется отдельно, на настоящем PostgreSQL —
// `tests/concurrency/interest-cadence.test.ts` (AC-8).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPool } from '@n4/db';
import { recordProInterest } from '../../../apps/api/src/interest/record-pro-interest.js';

interface RecordedQuery {
  readonly text: string;
  readonly params?: readonly unknown[];
}

function makeFakePool(nowRow: { ts: Date; day: string }): { pool: DbPool; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  const client = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('now() AS ts')) {
        return { rows: [nowRow], rowCount: 1 };
      }
      if (text.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT id FROM pro_interest')) {
        // Строки за день ещё нет — путь «recorded», не «already_recorded».
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT partner_code_id FROM attribution')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO pro_interest')) {
        return { rows: [{ id: 'fake-id' }], rowCount: 1 };
      }
      throw new Error(`неожиданный запрос в фейковом пуле: ${text}`);
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool: pool as unknown as DbPool, calls };
}

describe('RV-01: единый момент транзакции — не часы приложения', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('лок, cadence-проверка и created_at читают ОДИН результат запроса к БД, а не Date.now() приложения', async () => {
    // Момент транзакции («ответ БД»): 00:00:00.200 по Москве 14.09 — уже СЛЕДУЮЩИЙ день.
    const ts = new Date('2026-09-13T21:00:00.200Z');
    const day = '2026-09-14';

    // Часы ПРИЛОЖЕНИЯ подделаны на 23:59:59.900 по Москве 13.09 — «вчера» относительно
    // момента транзакции. До правки именно ЭТО значение приложения ушло бы в `day` парам-
    // етра, минуя факт, что соединение/лок могли быть получены уже после полуночи.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T20:59:59.900Z'));

    const { pool, calls } = makeFakePool({ ts, day });

    const outcome = await recordProInterest(pool, {
      ownerKey: 'owner-rv01',
      deviceSessionId: 'device-rv01',
      contact: 'rv01@b.ru',
      source: 'user_limit',
    });

    expect(outcome.outcome).toBe('recorded');

    // Запрос момента — РОВНО один: лок, проверка и вставка читают ОДИН результат, а не
    // считают время в трёх разных местах.
    const momentCalls = calls.filter((call) => call.text.includes('now() AS ts'));
    expect(momentCalls).toHaveLength(1);

    const lockCall = calls.find((call) => call.text.includes('pg_advisory_xact_lock'));
    // Ключ лока содержит day БД ('2026-09-14'), а НЕ день часов приложения ('2026-09-13').
    expect(lockCall?.params?.[0]).toBe(`owner-rv01:${day}`);

    const selectCall = calls.find((call) => call.text.includes('SELECT id FROM pro_interest'));
    expect(selectCall?.params).toEqual(['owner-rv01', day]);

    const insertCall = calls.find((call) => call.text.includes('INSERT INTO pro_interest'));
    // created_at вставки — ТОТ ЖЕ `ts`, что дал единственный запрос момента, а не отдельный
    // `DEFAULT now()` СУБД и не часы приложения.
    expect(insertCall?.params?.at(-1)).toBe(ts);
  });
});
