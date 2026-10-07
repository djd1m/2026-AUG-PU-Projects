import { campaignIn, launchIn, planLimits } from '@grelka/shared';
import { preflightLaunch, buildLaunchConsent, createCheckout } from '@grelka/core';
import { authUserId, writeAudit, userPlan, planQuotaLeft, isRuAddress } from './services.ts';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';

const ok = (t: Record<string, unknown> = {}) => ({ ok: true, ...t });

function requestQueueOf(cfg: Config) {
  if (!cfg.queue) throw Object.assign(new Error('очередь не инициализирована'), { code: 500 });
  return cfg.queue;
}

export function registerCampaignBillingRoutes(app: FastifyInstance, cfg: Config) {
  const db = cfg.db;

  app.post('/api/campaigns', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const quota = await planQuotaLeft(db, userId, Date.now());
    const lim = planLimits(quota.plan);
    if (lim.campaigns !== null) {
      const used = Number((await db.one<{ n: string }>(
        `SELECT count(DISTINCT c.id)::text AS n FROM campaigns c WHERE c.user_id = $1`, [userId]))?.n ?? '0');
      if (used >= lim.campaigns) return reply.code(409).send({ ok: false, error: `лимит кампаний ${quota.plan}: ${used}/${lim.campaigns}` });
    }
    const input = campaignIn.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ ok: false, error: input.error.issues[0]?.message ?? 'валидация кампании' });
    const id = crypto.randomUUID();
    const headerFields = (input.data.recipients_csv.split(/\r?\n/)[0] ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    await db.exec('INSERT INTO campaigns (id, user_id, name, daily_limit, status) VALUES ($1,$2,$3,$4,$5)', [
      id, userId, input.data.name, lim.dailyPerMailbox, 'draft',
    ]);
    for (let i = 0; i < input.data.steps.length; i++) {
      await db.exec('INSERT INTO campaign_steps (id, campaign_id, step_order, offset_days, template) VALUES ($1,$2,$3,$4,$5)', [
        crypto.randomUUID(), id, i + 1, input.data.steps[i]!.offset_days, input.data.steps[i]!.template,
      ]);
    }
    await writeAudit(db, userId, 'campaign_create', `campaign=${id}`, Date.now());
    return reply.code(201).send(ok({ campaign: { id, name: input.data.name, headerFields } }));
  });

  app.post('/api/campaigns/:id/recipients', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const { id } = req.params as { id: string };
    const camp = await db.one<{ id: string }>('SELECT id FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!camp) return reply.code(404).send({ ok: false, error: 'кампания не найдена' });
    const csv = String((req.body as { csv?: string })?.csv ?? '');
    if (!csv.trim()) return reply.code(400).send({ ok: false, error: 'пустой CSV (VR-100)' });
    const { importRecipients } = await import('@grelka/core');
    const stopRepo = await makeStopRepo(db);
    const rep = await importRecipients(csv, id, stopRepo, db, {
      write: (action, subject) => void writeAudit(db, userId, action, subject, Date.now()),
    });
    await db.exec(`UPDATE campaigns SET status = 'ready' WHERE id = $1 AND status = 'draft'`, [id]);
    return ok({ imported: rep.imported, rejected: rep.rejected.reduce<Record<string, number>>((acc, r) => ((acc[r.reason] = (acc[r.reason] ?? 0) + 1), acc), {}) });
  });

  app.post('/api/campaigns/:id/launch', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const { id } = req.params as { id: string };
    const camp = await db.one<{ id: string; user_id: string; status: string; name: string }>(
      'SELECT id, user_id, status, name FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!camp) return reply.code(404).send({ ok: false, error: 'кампания не найдена' });
    if (camp.status !== 'ready') return reply.code(409).send({ ok: false, error: `статус ${camp.status}: запуск требует ready (сначала список)` });
    const input = launchIn.safeParse(req.body);
    if (!input.success) return reply.code(409).send({ ok: false, error: 'требуется явное согласие на действие от имени ваших ящиков' });

    const mailboxRows = await db.rows<{ id: string; address: string; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; login: string }>(
      `SELECT id, address, smtp_host, smtp_port, imap_host, imap_port, login FROM mailboxes WHERE user_id = $1 AND status = 'verified' ORDER BY created_at`, [userId]);
    const recipients = await db.rows<{ address: string }>(
      `SELECT DISTINCT r.address FROM recipients r WHERE r.campaign_id = $1 AND r.blocked_reason IS NULL AND r.replied_at IS NULL AND r.complained = false`, [id]);
    const stopBlocked = await db.rows<{ address: string }>(
      `SELECT address FROM stoplist_entries`, []);
    const stopSet = new Set(stopBlocked.map((x) => x.address));
    const sendable = recipients.filter((r) => !stopSet.has(r.address));

    const deps = {
      dkimOk: async () => {
        const d = await db.one<{ ok: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM domains WHERE user_id = $1 AND dkim_status = 'ok') AS ok`, [userId]);
        return d?.ok ?? false;
      },
      verifiedMailboxCount: async () => mailboxRows.length,
      recipientCount: async () => sendable.length,
      consentTextVersion: input.data.consent_text_version,
      ruRecipientsPresent: async () => sendable.some((r) => isRuAddress(r.address)),
      ruAck: input.data.ru_recipients_ack === true,
    };
    const pf = await preflightLaunch(id, deps);
    if (!pf.ok) {
      return reply.code(409).send({ ok: false, error: 'pre-flight не пройден', reasons: pf.reasons });
    }
    const consent = buildLaunchConsent(id, userId, input.data.consent_text_version, Date.now());
    await db.exec(`UPDATE campaigns SET status = 'launched', consent_text_version = $2, consent_recorded_at = $3 WHERE id = $1`, [
      id, input.data.consent_text_version, new Date(Date.now()),
    ]);
    await writeAudit(db, userId, 'launch', `campaign=${id} consent=${consent.consentText.slice(0, 60)}`, Date.now(), input.data.consent_text_version);

    const planNow = await userPlan(db, userId);
    const lim = planLimits(planNow.plan);
    const slots = (await import('@grelka/core')).scheduleDailySlots(
      id,
      sendable.map((r) => r.address),
      mailboxRows.map((m) => ({ id: m.id, quotaLeft: lim.dailyPerMailbox })),
      planNow.plan,
      (await db.rows<{ off: number }>('SELECT offset_days AS off FROM campaign_steps WHERE campaign_id = $1 ORDER BY step_order', [id])).map((r) => r.off),
      new Date().toISOString().slice(0, 10),
    );
    let enqueued = 0;
    for (const s of slots) {
      await requestQueueOf(cfg).add('campaign:send', s, s.slotDate === new Date().toISOString().slice(0, 10) ? 0 : Math.max(0, Date.parse(`${s.slotDate}T00:00:00Z`) - Date.now()));
      enqueued++;
    }
    return ok({ campaign: { id, status: 'launched' }, slots_planned: enqueued, note: 'отправки идут через очередь с предварительным стоп-скрином' });
  });

  app.post('/api/campaigns/:id/pause', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const { id } = req.params as { id: string };
    await db.exec(`UPDATE campaigns SET status = 'paused' WHERE id = $1 AND user_id = $2 AND status = 'launched'`, [id, userId]);
    await writeAudit(db, userId, 'pause', `campaign=${id}`, Date.now());
    return ok();
  });

  app.get('/api/campaigns', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const rows = await db.rows(
      `SELECT c.id, c.name, c.status, c.daily_limit,
              (SELECT count(*)::text FROM recipients r WHERE r.campaign_id = c.id AND r.blocked_reason IS NULL) AS recipients,
              (SELECT count(*)::text FROM send_log sl WHERE sl.campaign_id = c.id AND sl.status = 'sent') AS sent
         FROM campaigns c WHERE c.user_id = $1 ORDER BY c.created_at DESC`, [userId]);
    return ok({ data: rows });
  });

  app.post('/api/billing/checkout', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const body = (req.body ?? {}) as { plan?: string; currency?: string };
    const plan = body.plan as 'base' | 'pro';
    const currency = (body.currency === 'USD' ? 'USD' : 'RUB');
    if (plan !== 'base' && plan !== 'pro') return reply.code(400).send({ ok: false, error: 'тариф должен быть base или pro' });
    const email = String((await db.one<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]))?.email ?? 'user');
    const out = await createCheckout(
      { checkouts: [], subscriptions: new Map(), processedWebhooks: new Set(), audit: [] },
      { userRef: userId, payerEmail: email, plan, currency, returnUrl: `${cfg.baseUrl}/paywall?back=1` },
      cfg.demoMode
        ? {}
        : {
            yookassa: { shopId: process.env.YOOKASSA_SHOP_ID ?? '', apiKey: process.env.YOOKASSA_API_KEY ?? '' },
            stripe: { secretKey: process.env.STRIPE_SECRET_KEY ?? '' },
          },
      Date.now(),
    );
    if (cfg.demoMode) {
      const urlParams = out.ok ? '' : '';
      void urlParams;
      const url = `${cfg.baseUrl}/paywall?demo_paid=${plan}&user=${userId}`;
      return ok({ checkout_url: url, demo: true, note: 'демо-платёж: подписка активируется без сети' });
    }
    if (!out.ok) return reply.code(out.code ?? 502).send({ ok: false, error: out.reason ?? 'checkout failed' });
    return ok({ checkout_url: out.url });
  });

  app.post('/api/webhooks/yookassa', async (req, reply) => {
    if (cfg.demoMode) {
      const bodyDemo = (req.body ?? {}) as { metadata?: Record<string, string> };
      const userRef = String(bodyDemo.metadata?.user_ref ?? '');
      const planRaw = String(bodyDemo.metadata?.plan ?? '');
      if (!userRef || !(planRaw === 'base' || planRaw === 'pro')) return reply.code(400).send({ ok: false, error: 'demo metadata' });
      await db.exec(`INSERT INTO subscriptions (id, user_id, plan, status, current_until) VALUES ($1,$2,$3,'active',$4)
                     ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = 'active', current_until = EXCLUDED.current_until`,
        [crypto.randomUUID(), userRef, planRaw, new Date(Date.now() + 30 * 86400_000)]);
      await writeAudit(db, userRef, 'subscription_active', `provider=demo plan=${planRaw}`, Date.now());
      return { ok: true, demo: true };
    }
    const creds = { shopId: process.env.YOOKASSA_SHOP_ID ?? '', apiKey: process.env.YOOKASSA_API_KEY ?? '' };
    const { handleYooWebhookOrchestrated } = await import('@grelka/core');
    const res = await handleYooWebhookOrchestrated(
      { checkouts: [], subscriptions: new Map(), processedWebhooks: new Set(), audit: [] },
      req.body as never, req.ip, creds, Date.now(),
    );
    return reply.code(res.code).send(res);
  });

  app.post('/api/webhooks/stripe', async (req, reply) => {
    if (cfg.demoMode) return { ok: true, demo: true };
    const raw = String(req.body ?? '');
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const { verifyStripeSignature } = await import('@grelka/core');
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'] as string, secret)) {
      return reply.code(400).send({ ok: false, error: 'подпись вебхука не совпала' });
    }
    return reply.code(200).send({ ok: true });
  });
}

async function makeStopRepo(db: Config['db']) {
  return {
    async findBlockers(addresses: string[]) {
      if (!addresses.length) return new Set<string>();
      const rows = await db.rows<{ address: string }>(
        `SELECT address FROM stoplist_entries WHERE address = ANY($1::text[])`, [addresses]);
      return new Set(rows.map((r) => r.address));
    },
    async insert(e: { address: string; source: string; dueAt: Date }) {
      await db.exec(
        `INSERT INTO stoplist_entries (id, address, source, due_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT (address) DO NOTHING`,
        [crypto.randomUUID(), e.address, e.source, e.dueAt],
      );
    },
  };
}
