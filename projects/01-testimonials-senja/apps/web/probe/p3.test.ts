import { afterAll, describe, it } from 'vitest';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { pool, withAccount, withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { attemptLogin } = await import('../src/lib/login');
const { changePassword } = await import('../src/lib/password-change');

afterAll(async () => { await closePool(); });

const OLD = 'old-correct-horse-battery';
let seq = 0;
const RUN = `${process.pid}-${Date.now().toString(36)}`;
const ip = () => `probekey-${RUN}-${(seq += 1)}`;

async function makeOwner() {
  seq += 1;
  const slug = `probe-${seq}-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) =>
    registerAccountAndProject(c, { email, password: OLD, desired_slug: slug, project_name: 'P' }),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]),
  );
  return { accountId: rows[0]!.id, email, slug };
}

const change = (o: { accountId: string }, current: string, next: string, addr: string) =>
  withAccount(o.accountId, (c) =>
    changePassword(c, { accountId: o.accountId, ip: addr, current, next }),
  ).then((r) => r, (e) => ({ ok: false, reason: `THROW:${(e as Error).code ?? ''}:${(e as Error).message}` } as never));

function flood(o: { accountId: string }, K: number, deadline: number, fixedIp?: string) {
  let sent = 0;
  const stop = { now: false };
  const one = async () => {
    while (!stop.now && Date.now() < deadline) {
      sent += 1;
      await change(o, 'мимо-пароль', 'вор-новый-пароль-1', fixedIp ?? ip());
    }
  };
  return { workers: Promise.all(Array.from({ length: K }, one)), stop, sent: () => sent };
}
async function ownerAttempts(o: { accountId: string }, tries: number, deadline: number) {
  const out: string[] = [];
  let current = OLD;
  for (let i = 0; i < tries && Date.now() < deadline; i += 1) {
    const next = `владелец-новый-${i}-${Date.now()}`;
    const r = await change(o, current, next, ip());
    if (r.ok) { out.push('ok'); current = next; } else out.push((r as { reason: string }).reason);
    await new Promise((res) => setTimeout(res, 60));
  }
  return out;
}

describe('P3 — чувствительность запирания к числу параллельных запросов вора', () => {
  for (const K of [1, 2, 4]) {
    it(`K=${K} параллельных запросов вора с пулом адресов`, async () => {
      const o = await makeOwner();
      const deadline = Date.now() + 4000;
      const f = flood(o, K, deadline);
      const owner = await ownerAttempts(o, 15, deadline);
      f.stop.now = true; await f.workers;
      console.log(`P3 K=${K}: вор=${f.sent()} успехов владельца=${owner.filter((r) => r === 'ok').length}/${owner.length} ${JSON.stringify(owner)}`);
    });
  }
});

describe('P4 — взаимная блокировка входа и смены пароля (for update на accounts)', () => {
  it('30 раундов: 10 входов + 10 смен на один аккаунт одновременно', async () => {
    const errors: string[] = [];
    for (let round = 0; round < 30; round += 1) {
      const o = await makeOwner();
      const jobs: Promise<unknown>[] = [];
      for (let i = 0; i < 10; i += 1) {
        jobs.push(withService((c) => attemptLogin(c, o.email, OLD, ip())).catch((e) => {
          errors.push(`login round=${round} code=${(e as { code?: string }).code} ${(e as Error).message}`);
        }));
        jobs.push(change(o, OLD, `новый-${round}-${i}-длинный`, ip()).then((r) => {
          const reason = (r as { reason?: string }).reason ?? '';
          if (reason.startsWith('THROW')) errors.push(`change round=${round} ${reason}`);
        }));
      }
      await Promise.all(jobs);
    }
    console.log(`P4: исключений=${errors.length}\n${errors.slice(0, 20).join('\n')}`);
  });
});

describe('P5 — может ли ВОР исчерпать счётчик успешных смен (pwchange_success)', () => {
  it('50 неудачных попыток вора: сколько строк в scope pwchange_success', async () => {
    const o = await makeOwner();
    for (let i = 0; i < 50; i += 1) await change(o, 'мимо', 'вор-новый-пароль-1', ip());
    const { rows } = await withService((c) =>
      c.query<{ scope: string; n: string }>(
        'select scope, count(*)::text as n from rate_limit_events group by scope order by scope'),
    );
    console.log(`P5 после 50 неудач вора: ${JSON.stringify(rows)}`);
    // и сколько строк успеха у этого конкретного аккаунта — через попытку владельца
    const r = await change(o, OLD, 'владелец-новый-пароль-1', ip());
    console.log(`P5 владелец после этого: ${JSON.stringify(r)}`);
  });
});

describe('P6 — что ещё даёт 55P03, кроме конкуренции', () => {
  it('DDL на accounts (миграция/ALTER) → маршрут отвечает 409 «повторите»', async () => {
    const o = await makeOwner();
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('lock table accounts in access exclusive mode');
      const r = await change(o, OLD, 'владелец-новый-пароль-1', ip());
      console.log(`P6 ALTER-подобная блокировка accounts: ${JSON.stringify(r)}`);
    } finally {
      await holder.query('rollback'); holder.release();
    }
  });

  it('удержание строки sessions (второй UPDATE) → тоже 55P03', async () => {
    const o = await makeOwner();
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select * from sessions where account_id = $1 for update', [o.accountId]);
      const r = await change(o, OLD, 'владелец-новый-пароль-2', ip());
      console.log(`P6b удержание sessions: ${JSON.stringify(r)}`);
    } finally {
      await holder.query('rollback'); holder.release();
    }
  });
});
