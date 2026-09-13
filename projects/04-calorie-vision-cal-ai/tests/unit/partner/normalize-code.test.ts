// NormalizeAndFindCode (AC-partner-codes-and-cabinet-1) — форма кода, границы 4/12,
// недействительный код и неизвестный код ничего не меняют.
//
// Форма и обрезка пробелов — чистая функция, проверяется без базы. `found`/`invalid` по
// неизвестному коду требует реального `partner_code` — используется настоящий Postgres
// (общая оснастка `tests/helpers/db.ts`), мок SELECT здесь не нужен.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { normalizeAndFindCode, normalizeCode } from '../../../apps/api/src/partner/normalize-code.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { seedPartner, seedPartnerCode } from '../../helpers/partner.js';

describe('normalizeCode — обрезка пробелов и верхний регистр (FR-partner-codes-and-cabinet-1, шаг 1)', () => {
  it('обрезает пробелы по краям и приводит к верхнему регистру', () => {
    expect(normalizeCode(' liza10 ')).toBe('LIZA10');
    expect(normalizeCode('AbC123')).toBe('ABC123');
  });
});

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-normalize-code');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('AC-partner-codes-and-cabinet-1: недействительный формат и неизвестный код ничего не меняют', () => {
  it('код короче 4 символов (форма) → invalid', async () => {
    const outcome = await normalizeAndFindCode(pool, 'AB');
    expect(outcome.kind).toBe('invalid');
  });

  it('код длиной 13 символов (граница исключительно) → invalid', async () => {
    const outcome = await normalizeAndFindCode(pool, 'A'.repeat(13));
    expect(outcome.kind).toBe('invalid');
  });

  it('код с дефисом/юникодом не проходит форму → invalid', async () => {
    expect((await normalizeAndFindCode(pool, 'LIZA-10')).kind).toBe('invalid');
    expect((await normalizeAndFindCode(pool, 'ЛИЗА10')).kind).toBe('invalid');
  });

  it('код ровно 4 символа, проходящий форму, но отсутствующий в partner_code → invalid', async () => {
    const outcome = await normalizeAndFindCode(pool, 'ZZZZ9999'.slice(0, 8));
    expect(outcome.kind).toBe('invalid');
  });

  it('код ровно 4 и ровно 12 символов (граница включительно) находится, если существует', async () => {
    const partner = await seedPartner(pool, 'liza');
    const short = await seedPartnerCode(pool, partner.partnerId, 'AB12');
    const long = await seedPartnerCode(pool, partner.partnerId, 'ABCDEFGH1234');

    const foundShort = await normalizeAndFindCode(pool, ' ab12 ');
    const foundLong = await normalizeAndFindCode(pool, 'abcdefgh1234');

    expect(foundShort).toEqual({ kind: 'found', code: expect.objectContaining({ id: short.id }) });
    expect(foundLong).toEqual({ kind: 'found', code: expect.objectContaining({ id: long.id }) });
  });

  it('AC-1: оба случая (форма и отсутствие) не создают и не меняют строк attribution/growth_event', async () => {
    await normalizeAndFindCode(pool, 'AB'); // не проходит форму
    await normalizeAndFindCode(pool, 'ZZZZ9999'); // проходит форму, отсутствует

    const attributions = await pool.query('SELECT count(*)::int AS n FROM attribution');
    const events = await pool.query('SELECT count(*)::int AS n FROM growth_event');
    expect(attributions.rows[0]?.n).toBe(0);
    expect(events.rows[0]?.n).toBe(0);
  });
});
