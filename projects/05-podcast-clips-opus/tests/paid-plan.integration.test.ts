// Фича 30 payments: что даёт действующий тариф paid — на НАСТОЯЩЕМ PostgreSQL 16. AC-3 (рендер без метки), AC-11
// (истёкший оплаченный план читается как free ДО сторожа), AC-12 (сторож и срок хранения от конца оплаты), AC-13
// (оператор с журналом), AC-15 (потолок минут paid, конкурентно), стирание аккаунта сохраняет платёж без связи с человеком.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, expirePaidPlans, transaction, checkAndConsumeQuota, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { leaseAttempt } from '../packages/db/src/attempts';
import { getRenderInput } from '../packages/db/src/render';
import { setPlanByOperator } from '../packages/db/src/ops-set-plan';
import { watermarkRequired } from '../apps/worker/src/render/watermark';
import { ScreenService } from '../apps/web/src/server/screen';
import { ShortLinkService, previewState } from '../apps/web/src/server/short-link';
import { remainingLimits } from '../apps/web/src/server/limits';
import { retentionTick, ERASURE_QUIET_MS, type RetentionStorage } from '../apps/web/src/server/retention';
import { loadLimits } from '../packages/shared/src/config';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';

const url = process.env.DATABASE_URL;
const DAY = 86_400_000;
describe.skipIf(!url)('тариф paid на настоящем PostgreSQL', () => {
  let pool: Pool;
  const schema = `paid_${randomBytes(8).toString('hex')}`;
  const limits = loadLimits(environment());
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна БД *_test');
    await ensureTestDatabase(url);
    pool = createPool(url, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account, quota_counter, payment, payment_event, operator_action CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });

  // Аккаунт: 'free' | 'paid-active' (оплачен ещё 10 дней) | 'paid-expired' (срок кончился 1 день назад, сторож не проходил)
  // | 'operator'. finishedDaysAgo — когда запись стала done.
  async function fixture(kind: 'free' | 'paid-active' | 'paid-expired' | 'paid-long-expired' | 'operator', finishedDaysAgo = 5) {
    const [plan, source, until] = kind === 'free' ? ['free', 'none', null] : kind === 'operator' ? ['paid', 'operator', null]
      : ['paid', 'payment', new Date(Date.now() + (kind === 'paid-active' ? 10 : kind === 'paid-expired' ? -1 : -4) * DAY)];
    const account = (await pool.query(`INSERT INTO account(email,password_hash,plan,plan_source,plan_paid_until) VALUES ($1,'x',$2,$3,$4) RETURNING id`,
      [`${randomUUID()}@test.invalid`, plan, source, until])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,duration_seconds,clips_total,finished_at)
      VALUES ($1,$2,'upload',100,100,'source','done',120,1,$3) RETURNING id`, [account, randomUUID(), new Date(Date.now() - finishedDaysAgo * DAY)])).rows[0].id as string;
    const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key)
      VALUES ($1,1,0,20,'Клип','done',true,'clips/free/v/c.mp4','thumbs/v/c.jpg') RETURNING id`, [video])).rows[0].id as string;
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = Array.from(randomBytes(6), b => alphabet[b % alphabet.length]).join('');
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2)', [clip, code]);
    return { account, video, clip };
  }
  const memoryStorage = (): RetentionStorage => ({ delete: vi.fn(async () => {}), eraseClipPrefix: vi.fn(async () => {}), erasePrefix: vi.fn(async () => {}) });

  it('AC-3/AC-11 рендер: метку решает ДЕЙСТВУЮЩИЙ план из базы — оплачен → без метки; срок истёк (сторож ещё не был) → с меткой', async () => {
    const renderPlan = async (kind: Parameters<typeof fixture>[0]) => {
      const f = await fixture(kind);
      await pool.query(`UPDATE video SET status='rendering' WHERE id=$1`, [f.video]);
      await pool.query(`UPDATE clip SET status='queued' WHERE id=$1`, [f.clip]);
      await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments) VALUES ($1,'ru',120,1,'[{"word":"Привет","start":0,"end":1}]','[]')`, [f.video]);
      const attempt = (await leaseAttempt(pool, f.video, 'render', 1, f.clip))!;
      return watermarkRequired((await getRenderInput(pool, attempt))!.plan);
    };
    expect(await renderPlan('paid-active')).toBe(false);
    expect(await renderPlan('operator')).toBe(false);
    expect(await renderPlan('paid-expired')).toBe(true);
    expect(await renderPlan('free')).toBe(true);
  });

  it('AC-11 чтения: экран клипов, /c/, остаток минут — истёкший оплаченный план = free, действующий = paid', async () => {
    const screen = new ScreenService(pool), links = new ShortLinkService(pool);
    const active = await fixture('paid-active'), expired = await fixture('paid-long-expired', 10), free = await fixture('free');
    expect((await screen.clips(active.account, active.video)).clips[0]).toMatchObject({ expires_at: null, available: true });
    // Истёк 4 дня назад, запись готова 10 дней назад: срок хранения = конец оплаты + 3 сут = 1 день назад → недоступен.
    const expiredClip = (await screen.clips(expired.account, expired.video)).clips[0]!;
    expect(expiredClip.available).toBe(false);
    expect(Math.abs(Date.parse(expiredClip.expires_at!) - (Date.now() - DAY))).toBeLessThan(60_000);
    expect((await screen.clips(free.account, free.video)).clips[0]!.available).toBe(false);
    const codeOf = async (clip: string) => (await pool.query('SELECT code FROM clip_link WHERE clip_id=$1', [clip])).rows[0].code as string;
    expect(previewState(await links.find(await codeOf(active.clip)), new Date())).toBe('ready');
    expect(previewState(await links.find(await codeOf(expired.clip)), new Date())).toBe('expired');
    expect((await remainingLimits(pool, limits, active.account)).minutes).toBe(270);
    expect((await remainingLimits(pool, limits, expired.account)).minutes).toBe(90);
  });

  it('AC-12 сторож: истёкший оплаченный → free (срок сохранён); оператор не истекает; ретенция считает 3 сут от КОНЦА оплаты', async () => {
    const recent = await fixture('paid-expired', 20);        // оплата кончилась 1 день назад — клипы ещё 2 дня живы
    const old = await fixture('paid-long-expired', 20);       // кончилась 4 дня назад — стираются
    const operator = await fixture('operator', 20);
    expect(await expirePaidPlans(pool, 100)).toBe(2);
    expect((await pool.query('SELECT plan,plan_source,plan_paid_until IS NOT NULL AS dated FROM account WHERE id=$1', [recent.account])).rows[0])
      .toEqual({ plan: 'free', plan_source: 'none', dated: true });
    expect((await pool.query('SELECT plan,plan_source FROM account WHERE id=$1', [operator.account])).rows[0]).toEqual({ plan: 'paid', plan_source: 'operator' });
    const storage = memoryStorage();
    await retentionTick(pool, storage, new Date(), 100);
    const erased = (storage.eraseClipPrefix as ReturnType<typeof vi.fn>).mock.calls.map(call => String(call[0]));
    expect(erased).toContain(`clips/free/${old.video}/${old.clip}`);
    expect(erased.some(k => k.includes(recent.clip))).toBe(false);
    expect(erased.some(k => k.includes(operator.clip))).toBe(false);
  });

  it('AC-12 ретенция без сторожа: истёкший оплаченный план (ещё paid в строке) не спасает клипы старше 3 суток от конца оплаты', async () => {
    const old = await fixture('paid-long-expired', 20), active = await fixture('paid-active', 20);
    const storage = memoryStorage();
    await retentionTick(pool, storage, new Date(), 100);
    const erased = (storage.eraseClipPrefix as ReturnType<typeof vi.fn>).mock.calls.map(call => String(call[0]));
    expect(erased).toContain(`clips/free/${old.video}/${old.clip}`);
    expect(erased.some(k => k.includes(active.clip))).toBe(false);
  });

  it('AC-13 оператор: план и журнал; снятие стирает остаток срока; без причины, неизвестный план или почта — отказ без изменений', async () => {
    const f = await fixture('paid-active');
    const email = (await pool.query('SELECT email FROM account WHERE id=$1', [f.account])).rows[0].email as string;
    expect(await setPlanByOperator(pool, { email, plan: 'free', operator: 'ops', reason: '' })).toEqual({ kind: 'invalid', field: 'reason' });
    expect(await setPlanByOperator(pool, { email, plan: 'PAID', operator: 'ops', reason: 'возврат' })).toEqual({ kind: 'invalid', field: 'plan' });
    expect(await setPlanByOperator(pool, { email: 'nobody@example.ru', plan: 'free', operator: 'ops', reason: 'возврат' })).toEqual({ kind: 'not_found' });
    expect((await pool.query('SELECT plan FROM account WHERE id=$1', [f.account])).rows[0].plan).toBe('paid');
    expect(await setPlanByOperator(pool, { email: ` ${email.toUpperCase()} `, plan: 'free', operator: 'ops', reason: 'возврат по заявке клиента' }))
      .toEqual({ kind: 'updated', before: 'paid', after: 'free' });
    expect((await pool.query('SELECT plan,plan_source,plan_paid_until FROM account WHERE id=$1', [f.account])).rows[0]).toEqual({ plan: 'free', plan_source: 'none', plan_paid_until: null });
    expect((await pool.query('SELECT operator,plan_before,plan_after,reason FROM operator_action WHERE account_id=$1', [f.account])).rows)
      .toEqual([{ operator: 'ops', plan_before: 'paid', plan_after: 'free', reason: 'возврат по заявке клиента' }]);
    expect(await setPlanByOperator(pool, { email, plan: 'paid', operator: 'ops', reason: 'пилот' })).toMatchObject({ kind: 'updated', after: 'paid' });
    expect((await pool.query('SELECT plan_source FROM account WHERE id=$1', [f.account])).rows[0].plan_source).toBe('operator');
  });

  it('AC-15 минуты: paid списывает до 270, free — до 90; 20 одновременных списаний по 20 мин у paid — ровно 13, суточный потолок общий', async () => {
    const charge = (account: string, n: number) => transaction(pool, tx => checkAndConsumeQuota(tx, limits, account, 'minutes', n, new Date()));
    const free = await fixture('free'), paid = await fixture('paid-active'), expired = await fixture('paid-expired');
    expect(await charge(free.account, 90)).toEqual({ granted: true });
    expect(await charge(free.account, 1)).toEqual({ granted: false, scope: 'user_minutes' });
    expect(await charge(expired.account, 91)).toEqual({ granted: false, scope: 'user_minutes' });
    const results = await Promise.all(Array.from({ length: 20 }, () => charge(paid.account, 20)));
    expect(results.filter(r => r.granted)).toHaveLength(13);
    expect((await pool.query(`SELECT used FROM quota_counter WHERE scope='user_minutes' AND scope_key=$1`, [paid.account])).rows[0].used).toBe(260);
    // Суточный потолок продукта не меняется: 600 − 90 − 260 = 250 осталось на всех.
    expect((await pool.query(`SELECT used FROM quota_counter WHERE scope='global_minutes'`)).rows[0].used).toBe(350);
  });

  it('стирание аккаунта: строка payment остаётся (учёт) без связи с человеком; намерения стираются', async () => {
    const f = await fixture('paid-active');
    const intent = (await pool.query(`INSERT INTO payment_intent(account_id,price_minor,idempotency_key,status) VALUES ($1,99000,'k'||md5(random()::text),'succeeded') RETURNING id`, [f.account])).rows[0].id;
    await pool.query(`INSERT INTO payment(intent_id,account_id,provider,provider_payment_id,amount_minor,paid_at) VALUES ($1,$2,'fake','p-1',99000,now())`, [intent, f.account]);
    await pool.query(`UPDATE account SET status='erasing',deletion_requested_at=$2,erase_deadline=$2::timestamptz+interval '72 hours' WHERE id=$1`,
      [f.account, new Date(Date.now() - 2 * ERASURE_QUIET_MS)]);
    await retentionTick(pool, memoryStorage(), new Date(), 100);
    expect((await pool.query('SELECT status FROM account WHERE id=$1', [f.account])).rows[0].status).toBe('deleted');
    expect((await pool.query(`SELECT account_id,intent_id,amount_minor FROM payment WHERE provider_payment_id='p-1'`)).rows).toEqual([{ account_id: null, intent_id: null, amount_minor: 99000 }]);
    expect((await pool.query('SELECT count(*)::int AS n FROM payment_intent WHERE account_id=$1', [f.account])).rows[0].n).toBe(0);
  });
});
