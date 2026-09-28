// account-erasure на НАСТОЯЩЕМ Postgres 16 + pgvector: RequestErasure, EraseAccount, сторож, деньги партнёра, студия и
// клиент, журнал вопросов. AC-1…AC-12 плана (docs/features/account-erasure/01_plan.md) и конкурентные случаи AC-6
// (shared-resource-verification): удаление ↔ оплата, удаление ↔ приём приглашения, удаление ↔ «Обновить» источника.
// Решения владельца — A-N6-054.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { acceptStudioInvite, applyVerifiedPayment, createPaymentIntent, createPool, createStudioInvite, eraseAccount, eraseBotQuestionLog,
  listErasableAccounts, listOwedPayouts, observeErasureOverdue, readErasurePreview, recordPartnerPayout, reindexSource, requestErasure, savePayoutDetails, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createAccountDependencies } from '../apps/web/src/server/account-runtime';
import { createAccountDeleteHandler } from '../apps/web/src/server/account-handler';
import { createWidgetDependencies } from '../apps/web/src/server/widget-deps';
import { createWidgetConfigHandler } from '../apps/web/src/server/widget-handler';
import { readErasureReceipt, readReceiptCookie } from '../apps/web/src/server/erasure-receipt';
import { AuthService } from '../apps/web/src/server/auth';
import { PgAuthStore } from '../apps/web/src/server/auth-store';
import { erasureTick } from '../apps/worker/src/erase-accounts';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { vectorFor } from './fixtures/fake-embeddings';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const HOST = 'https://shop.example';
const PASSWORD = 'correct-horse-9';
const SECRET = randomBytes(32).toString('hex');
const HOUR = 3_600_000;
const hex64 = (s: string) => createHash('sha256').update(s).digest('hex');

// ЕДИНЫЙ РЕЕСТР (AC-7): у КАЖДОЙ таблицы схемы — решение о строках стираемого аккаунта. Новая таблица без решения
// роняет тест: молча забытая таблица и есть неполное стирание.
const REGISTRY: Record<string, 'erase' | 'keep' | 'unrelated'> = {
  account: 'keep', session: 'erase', bot: 'erase', allowed_origin: 'erase', source: 'erase', page: 'erase', chunk: 'erase', index_job: 'erase',
  job_attempt: 'erase', preview: 'erase', visitor_session: 'erase', question_log: 'erase', widget_install: 'erase', quota_counter: 'erase',
  growth_event: 'keep', attribution: 'erase', studio_invite: 'erase', pro_interest: 'erase', payment_intent: 'erase', payment_event: 'unrelated',
  payment: 'keep', operator_action: 'keep', partner_code: 'keep', partner_code_use: 'erase', commission_entry: 'keep', partner_payout_details: 'erase',
  partner_audit: 'keep', index_start: 'erase', erasure_audit: 'keep', upload_orphan: 'erase', bot_verification_event: 'erase', _schema_migration: 'unrelated',
};

describe.skipIf(!databaseUrl)('удаление аккаунта на настоящем Postgres', () => {
  let pool: Pool;
  let hash = '';
  const schema = `erasure_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    hash = await bcrypt.hash(PASSWORD, 4);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const email = () => `e${randomBytes(6).toString('hex')}@example.ru`;
  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
  const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await q(sql, params))[0] ?? { n: 0 })[0]);
  async function account(plan = 'free', mail = email()) {
    const id = (await q<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, $2, $3) RETURNING id`, [mail, hash, plan]))[0]!.id;
    await pool.query(`INSERT INTO session (account_id, token_hash, ip_prefix, expires_at) VALUES ($1, $2, '198.51.100.0/24', now() + interval '1 day')`, [id, hex64(randomUUID())]);
    return { id, mail };
  }
  // Бот со всем, что стирание обязано найти: домен, источник, страница, фрагмент, задача (running), сессия посетителя,
  // журнал вопросов, установка, квота, событие роста.
  async function bot(owner: string, over: { studio?: string } = {}) {
    const key = randomBytes(16).toString('base64url');
    const id = (await q<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact, studio_account_id)
      VALUES ($1, 'active', $2, 'Пекарня', '+7 900 000-00-00', $3) RETURNING id`, [owner, key, over.studio ?? null]))[0]!.id;
    await pool.query('INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, $2)', [id, HOST]);
    const source = (await q<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, status) VALUES ($1, 'site', 'https://kolos.example/', 'ready') RETURNING id`, [id]))[0]!.id;
    const page = (await q<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'https://kolos.example/', 'Цены', $3) RETURNING id`,
      [source, id, hex64(id)]))[0]!.id;
    await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, text, token_count, embedding) VALUES ($1, $2, $3, 0, 'Доставка от 350 ₽', 5, $4::vector)`,
      [id, source, page, `[${vectorFor('доставка').join(',')}]`]);
    const job = (await q<{ id: string }>(`INSERT INTO index_job (bot_id, source_id, idempotency_key, status) VALUES ($1, $2, gen_random_uuid(), 'running') RETURNING id`, [id, source]))[0]!.id;
    const visitor = (await q<{ id: string }>(`INSERT INTO visitor_session (bot_id, ip_prefix, origin) VALUES ($1, '203.0.113.0/24', $2) RETURNING id`, [id, HOST]))[0]!.id;
    await pool.query(`INSERT INTO question_log (bot_id, visitor_session_id, outcome, text, text_expires_at) VALUES ($1, $2, 'unknown', 'Есть ли скидки?', now() + interval '14 days')`, [id, visitor]);
    await pool.query('INSERT INTO widget_install (bot_id, origin) VALUES ($1, $2)', [id, HOST]);
    await pool.query(`INSERT INTO quota_counter (scope, scope_key, period, used) VALUES ('bot_day_answers', $1, '2026-09-27', 3), ('visitor_answers', $2, '2026-09-27', 1)`, [id, visitor]);
    await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, visitor_session_id, from_domain, dedup_key) VALUES ('first_answer', $1, $2, $3, 'shop.example', $4)`,
      [id, owner, visitor, `first_answer:${id}`]);
    return { id, key, source, job, visitor };
  }
  const wire = () => {
    const sessions = new Map<string, string>();
    const deps = createAccountDependencies({ pool, publicOrigin: PUBLIC, sessionSecret: SECRET, allowMutation: async () => true,
      authenticate: async (token) => (sessions.has(token) ? { account_id: sessions.get(token)! } : null), log: () => {} });
    const handler = createAccountDeleteHandler(deps);
    const call = (accountId: string, payload: unknown, origin = PUBLIC) => {
      const token = randomBytes(32).toString('base64url').slice(0, 43);
      sessions.set(token, accountId);
      return handler(new Request(`${PUBLIC}/api/account`, { method: 'DELETE', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7',
        cookie: `__Host-n6_session=${token}` }, body: JSON.stringify(payload) }));
    };
    return { call };
  };
  const widgetConfig = (key: string) => createWidgetConfigHandler(createWidgetDependencies({ pool, publicOrigin: PUBLIC, secret: SECRET, allowMutation: async () => true, log: () => {} }))(
    new Request(`${PUBLIC}/w/v1/config?bot=${key}`, { headers: { origin: HOST, 'x-forwarded-for': '203.0.113.9' } }));
  const status = async (id: string) => (await q<{ status: string }>('SELECT status FROM account WHERE id = $1', [id]))[0]!.status;
  // Тихий час прошёл: запрос сдвигается в прошлое (стирание берёт только erasing старше часа).
  const age = (id: string, hours = 2) => pool.query(`UPDATE account SET erase_requested_at = erase_requested_at - make_interval(hours => $2) WHERE id = $1`, [id, hours]);
  async function pay(accountId: string, price = 99_000) {
    const intent = await createPaymentIntent(pool, { accountId, plan: 'nobadge', priceMinor: price, idempotencyKey: randomUUID() });
    if (intent.kind === 'conflict') throw new Error('намерение');
    const pid = randomUUID();
    return applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`, payloadSha256: '0'.repeat(64),
      payment: { id: pid, orderId: intent.intent.id, amountMinor: price, feeMinor: 3_465, paidAt: new Date().toISOString() } });
  }

  it('AC-1: без confirm, без пароля, с неверным паролем — 400/401, аккаунт active, ничего не изменено', async () => {
    const w = wire();
    const a = await account();
    await bot(a.id);
    for (const [payload, code] of [[{ password: PASSWORD }, 400], [{ confirm: 'true', password: PASSWORD }, 400], [{ confirm: true }, 400],
      [{ confirm: true, password: 'wrong-password' }, 401], [{ confirm: true, password: PASSWORD, extra: 1 }, 400]] as const) {
      const r = await w.call(a.id, payload);
      expect(r.status, JSON.stringify(payload)).toBe(code);
    }
    expect((await w.call(a.id, { confirm: true, password: PASSWORD }, 'https://evil.example')).status).toBe(403);
    expect(await status(a.id)).toBe('active');
    expect(await one(`SELECT count(*) FROM bot WHERE account_id = $1 AND status = 'active'`, [a.id])).toBe(1);
  });

  it('AC-2, AC-3: 202 → ОДНА транзакция erasing + 72 ч + сессии сняты + боты deleted + задачи зафенсены; виджет сразу 403 без ACAO; квитанция подписана', async () => {
    const w = wire();
    const a = await account();
    const b = await bot(a.id);
    expect((await widgetConfig(b.key)).status).toBe(200);
    const fenceBefore = await one('SELECT current_fence FROM index_job WHERE id = $1', [b.job]);
    const r = await w.call(a.id, { confirm: true, password: PASSWORD });
    expect(r.status).toBe(202);
    const cookies = r.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('__Host-n6_session=;') && c.includes('Max-Age=0'))).toBe(true);
    const receipt = readReceiptCookie(cookies.map((c) => c.split(';')[0]).join('; '));
    expect(readErasureReceipt(receipt, SECRET)).toBe(a.id);
    const row = (await q<{ status: string; hours: number }>(`SELECT status, round(extract(epoch FROM erase_deadline - erase_requested_at) / 3600)::int AS hours
      FROM account WHERE id = $1`, [a.id]))[0]!;
    expect(row).toEqual({ status: 'erasing', hours: 72 });
    expect(await one('SELECT count(*) FROM session WHERE account_id = $1', [a.id])).toBe(0);
    expect(await one(`SELECT count(*) FROM bot WHERE account_id = $1 AND status <> 'deleted'`, [a.id])).toBe(0);
    expect(await one('SELECT current_fence FROM index_job WHERE id = $1', [b.job])).toBe(fenceBefore + 1);
    // Виджет отказывает СРАЗУ и без ACAO. Код — 404 (фича 11: удалённый бот и стираемый аккаунт неотличимы от
    // несуществующего ключа, канон «чужой ресурс — 404»); буква плана «403» здесь уступает уже закреплённому поведению.
    const widget = await widgetConfig(b.key);
    expect([widget.status, widget.headers.get('access-control-allow-origin')]).toEqual([404, null]);
    // AC-4: повтор — «уже идёт», срок не сдвигается.
    const deadline = (await q<{ d: Date }>('SELECT erase_deadline AS d FROM account WHERE id = $1', [a.id]))[0]!.d.getTime();
    expect(await requestErasure(pool, a.id)).toEqual({ kind: 'already' });
    expect((await q<{ d: Date }>('SELECT erase_deadline AS d FROM account WHERE id = $1', [a.id]))[0]!.d.getTime()).toBe(deadline);
  });

  it('AC-5: вход под erasing — как неверный пароль; после deleted почта свободна для новой регистрации', async () => {
    const a = await account();
    const auth = new AuthService(new PgAuthStore(pool), SECRET);
    expect(await auth.login(a.mail, PASSWORD, '198.51.100.0/24')).not.toBeNull();
    await requestErasure(pool, a.id);
    expect(await auth.login(a.mail, PASSWORD, '198.51.100.0/24')).toBeNull();
    await age(a.id);
    expect(await eraseAccount(pool, a.id)).toEqual({ kind: 'erased' });
    expect(await auth.login(a.mail, PASSWORD, '198.51.100.0/24')).toBeNull();
    expect(await auth.register(a.mail, 'another-pass-1', '198.51.100.0/24')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await one('SELECT count(*) FROM account WHERE email = $1', [a.mail])).toBe(1);
  });

  it('AC-7: после стирания — ни одной строки аккаунта в таблицах «erase» (реестр покрывает ВСЮ схему), обезличено, надгробие deleted', async () => {
    const tables = (await q<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY 1', [schema])).map((r) => r.tablename);
    expect(tables.filter((t) => !(t in REGISTRY)), 'таблица без решения о стирании').toEqual([]);
    const a = await account('free');
    const b = await bot(a.id);
    await pool.query(`INSERT INTO pro_interest (account_id, plan_wanted, origin_screen) VALUES ($1, 'nobadge', 'pricing')`, [a.id]);
    await pool.query(`INSERT INTO quota_counter (scope, scope_key, period, used) VALUES ('account_embed_tokens', $1, '2026-09-27', 10)`, [a.id]);
    // Ключи дедупликации реальных форм (ревью H3): origin установки, префикс IP показа страницы, id бота.
    await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, from_domain, dedup_key) VALUES ('widget_install', $1, $2, 'shop.example', $3),
      ('public_page_view', $1, $2, NULL, $4)`, [b.id, a.id, `${b.id}:${HOST}`, `${b.id}:203.0.113.0/24`]);
    // verify-audit (миграция 014): событие журнала отметки у бота — уходит каскадом вместе с ботом.
    await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [b.id]);
    expect(await one('SELECT count(*) FROM bot_verification_event WHERE bot_id = $1', [b.id])).toBe(1);
    await requestErasure(pool, a.id);
    expect(await listErasableAccounts(pool, new Date(), 500)).not.toContain(a.id);   // тихий час не прошёл — сторож не берёт
    await age(a.id);
    expect(await listErasableAccounts(pool, new Date(), 500)).toContain(a.id);
    expect(await eraseAccount(pool, a.id)).toEqual({ kind: 'erased' });
    for (const [table, sql, params] of [
      ['bot', 'SELECT count(*) FROM bot WHERE account_id = $1 OR id = $2', [a.id, b.id]], ['source', 'SELECT count(*) FROM source WHERE bot_id = $1', [b.id]],
      ['chunk', 'SELECT count(*) FROM chunk WHERE bot_id = $1', [b.id]], ['index_job', 'SELECT count(*) FROM index_job WHERE id = $1', [b.job]],
      ['question_log', 'SELECT count(*) FROM question_log WHERE bot_id = $1', [b.id]], ['visitor_session', 'SELECT count(*) FROM visitor_session WHERE id = $1', [b.visitor]],
      ['quota_counter', 'SELECT count(*) FROM quota_counter WHERE scope_key = ANY($1::text[])', [[a.id, b.id, b.visitor]]],
      ['upload_orphan', 'SELECT count(*) FROM upload_orphan WHERE account_id = $1', [a.id]],
      ['bot_verification_event', 'SELECT count(*) FROM bot_verification_event WHERE bot_id = $1', [b.id]],
      ['session', 'SELECT count(*) FROM session WHERE account_id = $1', [a.id]], ['pro_interest', 'SELECT count(*) FROM pro_interest WHERE account_id = $1', [a.id]],
      ['growth_event (связи)', 'SELECT count(*) FROM growth_event WHERE account_id = $1 OR bot_id = $2 OR visitor_session_id = $3', [a.id, b.id, b.visitor]],
    ] as const) expect(await one(sql, [...params]), table).toBe(0);
    expect(await one(`SELECT count(*) FROM growth_event WHERE dedup_key LIKE '%' || $1 || '%' OR dedup_key LIKE '%' || $2 || '%' OR dedup_key LIKE '%shop.example%'
      OR dedup_key LIKE '%203.0.113.%' OR dedup_key LIKE '%' || $3 || '%'`, [a.id, b.id, b.visitor]), 'dedup_key с ПДн').toBe(0);
    expect(await one(`SELECT count(*) FROM growth_event WHERE type IN ('first_answer', 'widget_install', 'public_page_view')
      AND dedup_key = 'erased:' || id::text AND from_domain IS NULL`)).toBeGreaterThanOrEqual(3);   // агрегаты остались
    const tomb = (await q<Record<string, unknown>>(`SELECT status, email, password_hash, plan, came_from, signup_ip_prefix FROM account WHERE id = $1`, [a.id]))[0];
    expect(tomb).toEqual({ status: 'deleted', email: `deleted:${a.id}`, password_hash: '', plan: 'free', came_from: null, signup_ip_prefix: null });
    expect(await eraseAccount(pool, a.id)).toEqual({ kind: 'skipped' });           // идемпотентно
  });

  it('AC-8, AC-9: сбой одного аккаунта не держит другой; повтор доводит; просрочка — сигнал ДО попыток, одна строка overdue', async () => {
    const a = await account(), c = await account();
    const ba = await bot(a.id);
    await bot(c.id);
    await requestErasure(pool, a.id); await requestErasure(pool, c.id);
    await age(a.id); await age(c.id);
    const removed: string[] = [], logs: string[] = [];
    const failing = { removeUpload: async (_dir: string, job: string) => { if (job === ba.job) throw new Error('том недоступен'); removed.push(job); return true; }, log: (l: string) => logs.push(l) };
    const first = await erasureTick(pool, '/nonexistent', new Date(), 50, failing);
    expect(first).toMatchObject({ erased: 1, failed: 1 });
    expect([await status(a.id), await status(c.id)]).toEqual(['erasing', 'deleted']);
    expect(await one('SELECT count(*) FROM chunk WHERE bot_id = $1', [ba.id])).toBe(1);   // файл не удалён — строки не тронуты
    await pool.query(`UPDATE account SET erase_deadline = now() - interval '1 minute' WHERE id = $1`, [a.id]);
    const second = await erasureTick(pool, '/nonexistent', new Date(), 50, { ...failing, removeUpload: async (_d, job) => { removed.push(job); return true; } });
    expect(second).toMatchObject({ overdue: 1, erased: 1, failed: 0 });
    expect(logs.some((l) => l.startsWith('СИГНАЛ ОПЕРАТОРУ'))).toBe(true);
    expect(removed).toContain(ba.job);
    expect(await status(a.id)).toBe('deleted');
    expect(await observeErasureOverdue(pool, new Date())).toBe(0);
    expect(await one(`SELECT count(*) FROM erasure_audit WHERE account_id = $1 AND event = 'overdue'`, [a.id])).toBe(1);
  });

  it('AC-10: деньги — оплата удаляемому аккаунту на разбор без плана; клиенты партнёра partner_deleted без комиссии; доступное ≥ 1 000 ₽ ждёт выплату, холд НЕ сгорает — долг сервиса (A-N6-061)', async () => {
    const partner = await account();
    const code = `c${randomBytes(4).toString('hex')}`;
    const codeId = (await q<{ id: string }>(`INSERT INTO partner_code (code, owner_account_id, "group") VALUES ($1, $2, 'partner') RETURNING id`, [code, partner.id]))[0]!.id;
    const client = await account();
    await pool.query(`INSERT INTO attribution (account_id, partner_code_id, source) VALUES ($1, $2, 'code')`, [client.id, codeId]);
    // Зрелое начисление 1 500 ₽ (доступно) + свежее 300 ₽ (в холде) — через оплаты клиента.
    await pay(client.id);
    await pool.query(`UPDATE commission_entry SET amount_minor = 150000, available_at = now() - interval '1 day' WHERE partner_account_id = $1`, [partner.id]);
    await pay(client.id);
    await pool.query(`UPDATE commission_entry SET amount_minor = 30000 WHERE partner_account_id = $1 AND available_at > now()`, [partner.id]);
    expect(await savePayoutDetails(pool, partner.id, { method: 'sbp', phone: '+79000000000', bank: null })).toBe(true);
    const preview = await readErasurePreview(pool, partner.id);
    expect(preview?.partner).toEqual({ payoutMinor: 150_000, debtMinor: 30_000, hasDetails: true });
    await requestErasure(pool, partner.id);
    expect(await one(`SELECT count(*) FROM partner_code WHERE id = $1 AND frozen AND frozen_reason = 'owner_erased'`, [codeId])).toBe(1);
    expect((await q<{ status: string }>('SELECT status FROM attribution WHERE account_id = $1', [client.id]))[0]!.status).toBe('partner_deleted');
    const entriesBefore = await one('SELECT count(*) FROM commission_entry WHERE partner_account_id = $1', [partner.id]);
    expect(await pay(client.id)).toMatchObject({ applied: true });
    expect(await one('SELECT count(*) FROM commission_entry WHERE partner_account_id = $1', [partner.id])).toBe(entriesBefore);   // клиент больше не приносит
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'waiting_payout', payoutMinor: 150_000 });
    expect(await one('SELECT count(*) FROM partner_payout_details WHERE account_id = $1', [partner.id])).toBe(1);
    expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 150_000, key: 'erase-1', operator: 'op', reason: 'выплата перед удалением' }))
      .toMatchObject({ kind: 'recorded' });
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    const money = (await q<{ kind: string; amount_minor: string }>(`SELECT kind, amount_minor FROM commission_entry WHERE partner_account_id = $1 AND kind <> 'accrual' ORDER BY kind`, [partner.id]))
      .map((r) => [r.kind, Number(r.amount_minor)]);
    expect(money).toEqual([['payout', -150_000]]);                     // ничего не сгорело — ни одной записи списания
    expect(await one('SELECT COALESCE(sum(amount_minor), 0) FROM commission_entry WHERE partner_account_id = $1', [partner.id])).toBe(30_000);
    expect(await one(`SELECT amount_minor FROM erasure_audit WHERE account_id = $1 AND event = 'payout_owed'`, [partner.id])).toBe(30_000);
    expect((await listOwedPayouts(pool)).find((r) => r.account_id === partner.id)).toMatchObject({ owed_minor: 30_000, available_minor: 0,
      payout_email: `deleted:${partner.id}` });
    expect(await one('SELECT count(*) FROM partner_payout_details WHERE account_id = $1', [partner.id])).toBe(0);
    expect((await q<{ code: string }>('SELECT code FROM partner_code WHERE id = $1', [codeId]))[0]!.code).toMatch(/^erased-[0-9a-f]{24}$/);
    // Оплата клиентом, который сам удаляется: деньги на разбор, план не выдан, комиссии нет.
    const payer = await account();
    await requestErasure(pool, payer.id);
    expect(await pay(payer.id)).toEqual({ applied: false, reason: 'account_erasing' });
    expect((await q<{ review_reason: string }>('SELECT review_reason FROM payment WHERE account_id = $1', [payer.id]))[0]!.review_reason).toBe('account_erasing');
    expect((await q<{ plan: string }>('SELECT plan FROM account WHERE id = $1', [payer.id]))[0]!.plan).toBe('free');
  });

  // Партнёр с доступным `minor` (зрелое начисление по оплате) и реквизитами СБП.
  async function partnerWith(minor: number) {
    const partner = await account();
    await pool.query(`WITH p AS (INSERT INTO payment (provider, provider_payment_id, amount_minor, paid_at, account_id)
        VALUES ('fake', $2, 99000, now(), $1) RETURNING id)
      INSERT INTO commission_entry (partner_account_id, kind, amount_minor, available_at, payment_id)
      SELECT $1, 'accrual', $3, now() - interval '40 days', p.id FROM p`, [partner.id, randomUUID(), minor]);
    await savePayoutDetails(pool, partner.id, { method: 'sbp', phone: '+79000000001', bank: null });
    return partner;
  }
  const balance = (id: string) => one('SELECT COALESCE(sum(amount_minor), 0) FROM commission_entry WHERE partner_account_id = $1', [id]);

  it('AC-10: доступное ≥ 1 000 ₽, не выплаченное к запасу, НЕ сгорает — стирание в срок, сумма остаётся долгом payout_owed (ревью H1)', async () => {
    const partner = await partnerWith(200_000);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toMatchObject({ kind: 'waiting_payout' });
    expect(await eraseAccount(pool, partner.id, new Date(Date.now() + 67 * HOUR))).toEqual({ kind: 'erased' });
    expect(await one(`SELECT count(*) FROM commission_entry WHERE partner_account_id = $1 AND kind <> 'accrual'`, [partner.id])).toBe(0);
    expect(await balance(partner.id)).toBe(200_000);
    expect(await one(`SELECT amount_minor FROM erasure_audit WHERE account_id = $1 AND event = 'payout_owed'`, [partner.id])).toBe(200_000);
    expect((await listOwedPayouts(pool)).find((r) => r.account_id === partner.id)).toMatchObject({ owed_minor: 200_000, available_minor: 200_000 });
    expect(await one('SELECT count(*) FROM partner_payout_details WHERE account_id = $1', [partner.id])).toBe(0);
    expect(await one('SELECT count(*) FROM payment WHERE account_id = $1', [partner.id])).toBe(1);
    expect(await one(`SELECT count(*) FROM account WHERE id = $1 AND email LIKE 'deleted:%'`, [partner.id])).toBe(1);
  });

  it('AC-10: частичная выплата — остаток ≥ 1 000 ₽ ждёт дальше, остаток ниже минимума — долг, не сгорает (A-N6-061); ожидающий уходит в конец очереди (ревью H1, M5)', async () => {
    const partner = await partnerWith(250_000);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'waiting_payout', payoutMinor: 250_000 });
    const fresh = await account();
    await requestErasure(pool, fresh.id);
    await age(fresh.id);
    const queue = await listErasableAccounts(pool, new Date(), 500);
    expect(queue.indexOf(fresh.id)).toBeLessThan(queue.indexOf(partner.id));     // не пробовавшийся — раньше ожидающего
    await eraseAccount(pool, fresh.id);
    expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 100_000, key: 'part-1', operator: 'op', reason: 'часть' })).toMatchObject({ kind: 'recorded' });
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'waiting_payout', payoutMinor: 150_000 });
    expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 100_000, key: 'part-2', operator: 'op', reason: 'часть' })).toMatchObject({ kind: 'recorded' });
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    expect(await one(`SELECT count(*) FROM commission_entry WHERE partner_account_id = $1 AND kind NOT IN ('accrual', 'payout')`, [partner.id])).toBe(0);
    expect(await balance(partner.id)).toBe(50_000);
    expect(await one(`SELECT amount_minor FROM erasure_audit WHERE account_id = $1 AND event = 'payout_owed'`, [partner.id])).toBe(50_000);
  });

  it('ревью H2 детерминированно: пока замок выплаты занят, завершение стирания ЖДЁТ; выплата, стоявшая первой, проходит, долга нет', async () => {
    const partner = await partnerWith(200_000);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_payout:${partner.id}`]);
      const paying = recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: 'held', operator: 'op', reason: 'замок' });
      await new Promise((r) => setTimeout(r, 200));
      const erasing = eraseAccount(pool, partner.id, new Date(Date.now() + 67 * HOUR));
      await new Promise((r) => setTimeout(r, 1_500));   // без замка стирание партнёра без ботов успевает до конца
      expect(await status(partner.id), 'завершение не дождалось замка выплаты').toBe('erasing');
      await holder.query('COMMIT');
      expect(await paying).toMatchObject({ kind: 'recorded' });
      expect(await erasing).toEqual({ kind: 'erased' });
    } finally { holder.release(); }
    expect(await balance(partner.id)).toBe(0);
    expect(await one(`SELECT count(*) FROM erasure_audit WHERE account_id = $1 AND event = 'payout_owed'`, [partner.id])).toBe(0);
  });

  it('AC-6: выплата ↔ завершение стирания у запаса — одна блокировка: не бывает и выплаты, и долга, баланс не уходит в минус (ревью H2)', async () => {
    for (let round = 0; round < 8; round++) {
      const partner = await partnerWith(200_000);
      await requestErasure(pool, partner.id);
      await age(partner.id);
      const [paid, erased] = await Promise.all([
        recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `race-${round}`, operator: 'op', reason: 'гонка' }),
        eraseAccount(pool, partner.id, new Date(Date.now() + 67 * HOUR))]);
      expect(erased).toEqual({ kind: 'erased' });
      // Итог — по живому балансу и списку долгов, а не по исторической записи payout_owed (шестое ревью, находка 5):
      // выплата, взявшая замок после завершения, законно гасит уже записанный долг.
      const owed = (await listOwedPayouts(pool)).find((r) => r.account_id === partner.id)?.owed_minor ?? 0;
      if (paid.kind === 'recorded') expect([owed, await balance(partner.id)]).toEqual([0, 0]);
      else expect([paid.kind, owed, await balance(partner.id)]).toEqual(['not_found', 200_000, 200_000]);
    }
  }, 60_000);

  it('AC-11: удаление студии не трогает ботов клиентов (снимается только чтение), приглашения аннулируются; удаление клиента удаляет и полученных ботов', async () => {
    const studio = await account('studio'), client = await account();
    const own = await bot(studio.id);
    const given = await bot(client.id, { studio: studio.id });
    const invite = await createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: client.mail });
    expect(invite.kind).toBe('created');
    await requestErasure(pool, studio.id);
    expect(await one('SELECT count(*) FROM studio_invite WHERE studio_account_id = $1 AND accepted_by IS NULL', [studio.id])).toBe(0);
    await age(studio.id);
    expect(await eraseAccount(pool, studio.id)).toEqual({ kind: 'erased' });
    expect((await q<Record<string, unknown>>('SELECT account_id, status, studio_account_id FROM bot WHERE id = $1', [given.id]))[0])
      .toEqual({ account_id: client.id, status: 'active', studio_account_id: null });
    expect(await one('SELECT count(*) FROM bot WHERE id = $1', [own.id])).toBe(0);
    const clientSecond = await bot(client.id);
    // Непринятое приглашение ЖИВОЙ студии на почту клиента (ревью H4): бот студии, каскад его не найдёт — почта клиента
    // обязана исчезнуть при стирании клиента. Регистр почты в приглашении — другой.
    const other = await account('studio');
    const otherBot = await bot(other.id);
    await pool.query(`INSERT INTO studio_invite (bot_id, studio_account_id, token_hash, email, expires_at) VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
      [otherBot.id, other.id, hex64(randomUUID()), client.mail.toUpperCase()]);
    await requestErasure(pool, client.id);
    await age(client.id);
    await eraseAccount(pool, client.id);
    expect(await one('SELECT count(*) FROM bot WHERE id = ANY($1::uuid[])', [[given.id, clientSecond.id]])).toBe(0);
    expect(await one('SELECT count(*) FROM studio_invite WHERE lower(email) = $1', [client.mail])).toBe(0);
    expect(await one('SELECT count(*) FROM bot WHERE id = $1', [otherBot.id])).toBe(1);   // бот живой студии цел
  });

  it('AC-12: журнал вопросов бота стирает владелец; чужой — null; тексты и история посетителей удалены', async () => {
    const a = await account(), stranger = await account();
    const b = await bot(a.id);
    await pool.query(`UPDATE visitor_session SET history = '[{"question":"q","answer":"a","at":"2026-09-27T00:00:00Z"}]'::jsonb, history_at = now() WHERE id = $1`, [b.visitor]);
    expect(await eraseBotQuestionLog(pool, b.id, stranger.id)).toBeNull();
    expect(await eraseBotQuestionLog(pool, b.id, a.id)).toEqual({ erased: 1 });
    expect(await one('SELECT count(*) FROM question_log WHERE bot_id = $1', [b.id])).toBe(0);
    expect(await one(`SELECT jsonb_array_length(history) FROM visitor_session WHERE id = $1`, [b.visitor])).toBe(0);
    expect(await one('SELECT count(*) FROM chunk WHERE bot_id = $1', [b.id])).toBe(1);   // материалы бота не тронуты
  });

  it('AC-6: конкурентно — удаление ↔ оплата, удаление ↔ приём приглашения, удаление ↔ «Обновить», стирание ↔ оплата: без взаимной блокировки, итог допустимый', async () => {
    for (let round = 0; round < 8; round++) {
      // удаление ↔ оплата: либо план выдан ДО удаления, либо оплата на разбор account_erasing
      const a = await account();
      const intent = await createPaymentIntent(pool, { accountId: a.id, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
      if (intent.kind === 'conflict') throw new Error('намерение');
      const pid = randomUUID();
      const [erase, payment] = await Promise.all([requestErasure(pool, a.id), applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`,
        payloadSha256: '0'.repeat(64), payment: { id: pid, orderId: intent.intent.id, amountMinor: 99_000, feeMinor: 3_465, paidAt: new Date().toISOString() } })]);
      expect(erase.kind).toBe('accepted');
      expect(payment.applied === true || (payment.applied === false && payment.reason === 'account_erasing')).toBe(true);
      // удаление ↔ приём приглашения: владелец бота один, у удаляемого клиента бот не остаётся живым
      const studio = await account('studio'), client = await account();
      const offered = await bot(studio.id);
      const invite = await createStudioInvite(pool, { studioAccountId: studio.id, botId: offered.id, email: client.mail });
      if (invite.kind !== 'created') throw new Error('приглашение');
      const [, accepted] = await Promise.all([requestErasure(pool, client.id), acceptStudioInvite(pool, { token: invite.token, clientAccountId: client.id, ipPrefix: '192.0.2.0/24' })]);
      expect(await one(`SELECT count(*) FROM bot WHERE account_id = $1 AND status <> 'deleted'`, [client.id])).toBe(0);
      if (accepted.kind === 'accepted') expect(await one(`SELECT count(*) FROM bot WHERE id = $1 AND status = 'deleted'`, [offered.id])).toBe(1);
      // удаление ↔ «Обновить» источника: задача в итоге зафенсена, бот удалён
      const owner = await account();
      const src = await bot(owner.id);
      await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [src.job]);
      const before = await one('SELECT current_fence FROM index_job WHERE id = $1', [src.job]);
      const [, reindexed] = await Promise.all([requestErasure(pool, owner.id), reindexSource(pool, src.source, owner.id)]);
      expect(await one(`SELECT count(*) FROM bot WHERE id = $1 AND status = 'deleted'`, [src.id])).toBe(1);
      if (reindexed?.kind === 'queued') expect(await one('SELECT current_fence FROM index_job WHERE id = $1', [src.job])).toBe(before + 2);
      // стирание ↔ оплата по старому намерению: без взаимной блокировки; деньги записаны, план не выдан
      const late = await account();
      const lateIntent = await createPaymentIntent(pool, { accountId: late.id, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
      if (lateIntent.kind === 'conflict') throw new Error('намерение');
      await requestErasure(pool, late.id);
      await age(late.id);
      const latePid = randomUUID();
      const [erased, latePayment] = await Promise.all([eraseAccount(pool, late.id), applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${latePid}`,
        payloadSha256: '0'.repeat(64), payment: { id: latePid, orderId: lateIntent.intent.id, amountMinor: 99_000, feeMinor: 3_465, paidAt: new Date().toISOString() } })]);
      expect(erased).toEqual({ kind: 'erased' });
      expect(latePayment.applied).toBe(false);
      expect(await one('SELECT count(*) FROM payment WHERE provider_payment_id = $1 AND needs_review', [latePid])).toBe(1);
    }
  }, 60_000);
});
