// Истечение подписки: тариф гаснет, бренд-строка возвращается (P-9).

import { afterAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL_NOTIFY = process.env.TEST_DATABASE_URL_NOTIFY ?? process.env.TEST_DATABASE_URL ?? '';
process.env.GUEST_INTERNAL_URL = 'http://127.0.0.1:1';   // инвалидация упадёт и залогируется — это ок

const { closePool } = await import('../src/db.js');
const { expireSubscriptions } = await import('../src/expire.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

afterAll(async () => { await pgAdmin.end(); await closePool(); });

const uniq = (() => { let n = 0; return (p: string) => `${p}${process.pid}${++n}`; })();

async function paidAccount(periodEnd: string) {
  const acc = await pgAdmin.query(`insert into accounts (name) values ('Т') returning id`);
  const id = acc.rows[0].id;
  const slug = `exp-${uniq('s')}`;
  await pgAdmin.query(
    `insert into places (account_id, name, slug, branding_required) values ($1,'Т',$2,false)`, [id, slug]);
  await pgAdmin.query(
    `insert into subscriptions (account_id, plan, places_limit, current_period_end, status)
     values ($1,'point',1, now() + $2::interval, 'active')`, [id, periodEnd]);
  return { id, slug };
}

describe('P-9 истечение', () => {
  it('просроченная подписка гаснет, бренд-строка возвращается; живая — нетронута', async () => {
    const dead = await paidAccount('-1 hour');
    const alive = await paidAccount('20 days');
    const slugs = await expireSubscriptions();
    expect(slugs).toContain(dead.slug);
    expect(slugs).not.toContain(alive.slug);
    const d = await pgAdmin.query(
      `select s.status, p.branding_required from subscriptions s join places p on p.account_id=s.account_id
        where s.account_id=$1`, [dead.id]);
    expect(d.rows[0]).toEqual({ status: 'expired', branding_required: true });
    const a = await pgAdmin.query(
      `select s.status, p.branding_required from subscriptions s join places p on p.account_id=s.account_id
        where s.account_id=$1`, [alive.id]);
    expect(a.rows[0]).toEqual({ status: 'active', branding_required: false });
  });

  it('повторный прогон — пустой (идемпотентность истечения)', async () => {
    const again = await expireSubscriptions();
    // слаги ПРОШЛОГО прогона не возвращаются: status уже 'expired'
    expect(again.filter((s) => s.startsWith('exp-')).length).toBe(0);
  });
});
