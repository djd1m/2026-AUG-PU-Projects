// NormalizeAndFindCode на настоящем PostgreSQL (AC-partner-codes-and-cabinet-1): код,
// проходящий форму, но отсутствующий в `partner_code`, и код, реально найденный по границам
// 4/12. Форма и короткое замыкание ДО обращения к базе — в
// `tests/unit/partner/normalize-code.test.ts` (там БАЗЫ НЕТ, `vitest.config.ts`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { normalizeAndFindCode } from '../../../apps/api/src/partner/normalize-code.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { seedPartner, seedPartnerCode } from '../../helpers/partner.js';

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

describe('AC-partner-codes-and-cabinet-1: неизвестный код ничего не меняет', () => {
  it('код ровно 4 символа, проходящий форму, но отсутствующий в partner_code → invalid', async () => {
    const outcome = await normalizeAndFindCode(pool, 'ZZZZ9999'.slice(0, 8));
    expect(outcome).toEqual({ kind: 'invalid' });
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

  it('AC-1: невалидная форма и неизвестный (но валидный по форме) код не создают и не меняют строк attribution/growth_event', async () => {
    await normalizeAndFindCode(pool, 'AB'); // не проходит форму
    await normalizeAndFindCode(pool, 'ZZZZ9999'); // проходит форму, отсутствует

    const attributions = await pool.query('SELECT count(*)::int AS n FROM attribution');
    const events = await pool.query('SELECT count(*)::int AS n FROM growth_event');
    expect(attributions.rows[0]?.n).toBe(0);
    expect(events.rows[0]?.n).toBe(0);
  });
});
