import {
  registerIn, loginIn, domainIn, mailboxIn, poolJoinIn, launchIn,
} from '@grelka/shared';
import {
  insertUser, confirmEmail, loginUser, persistRefreshSession, revokeSession,
  authUserId, issueForUser, writeAudit, planQuotaLeft, isRuAddress,
} from './services.ts';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { userPlan } from './services.ts';

const ok = (t: Record<string, unknown> = {}) => ({ ok: true, ...t });

export function registerCoreRoutes(app: FastifyInstance, cfg: Config) {
  const db = cfg.db;

  app.get('/healthz', async () => ({ ok: true, mode: cfg.demoMode ? 'demo' : 'live' }));

  app.post('/api/auth/register', async (req, reply) => {
    const input = registerIn.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ ok: false, error: input.error.issues[0]?.message ?? 'валидация' });
    const email = input.data.email;
    try {
      const user = await insertUser(db, email, input.data.password, Date.now());
      if (cfg.demoMode) await confirmEmail(db, email, Date.now());
      const tokens = issueForUser(cfg, user.id, Date.now());
      await persistRefreshSession(db, user.id, tokens.refresh, cfg.refreshTtlSec, Date.now());
      return ok({ user: { id: user.id, email }, ...tokens, next: cfg.demoMode ? 'onboarding' : 'confirm_email' });
    } catch (e) {
      return reply.code((e as { code?: number }).code ?? 500).send({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = loginIn.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ ok: false, error: 'данные неверны' });
    try {
      const u = await loginUser(db, input.data.email, input.data.password);
      const tokens = issueForUser(cfg, u.id, Date.now());
      await persistRefreshSession(db, u.id, tokens.refresh, cfg.refreshTtlSec, Date.now());
      return ok({ user: { id: u.id, email: u.email }, ...tokens });
    } catch (e) {
      return reply.code((e as { code?: number }).code ?? 500).send({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/auth/logout', async (req) => {
    const userId = await authUserId(cfg, (req.headers.authorization as string));
    const refresh = ((req.body as { refresh?: string })?.refresh ?? '').slice(0, 200);
    if (refresh) await revokeSession(db, userId, refresh);
    await writeAudit(db, userId, 'logout', `user=${userId}`, Date.now());
    return { ok: true };
  });

  app.get('/api/domains', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const rows = await db.rows(
      'SELECT id, name, spf_status, dkim_status, dmarc_status, dns_checked_at FROM domains WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    return ok({ data: rows });
  });

  app.post('/api/domains', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const input = domainIn.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ ok: false, error: input.error.issues[0]?.message ?? 'домен' });
    const { name } = input.data;
    const dup = await db.one<{ id: string }>('SELECT id FROM domains WHERE user_id = $1 AND name = $2', [userId, name]);
    if (dup) return reply.code(409).send({ ok: false, error: 'домен уже привязан' });
    const st = cfg.demoMode
      ? { spf_status: 'ok', dkim_status: name.includes('fresh') ? 'warn' : 'ok', dmarc_status: 'ok' }
      : await dnsStatuses(name);
    const id = crypto.randomUUID();
    await db.exec(
      'INSERT INTO domains (id, user_id, name, spf_status, dkim_status, dmarc_status, dns_checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, userId, name, st.spf_status ?? 'unknown', st.dkim_status, st.dmarc_status, new Date()]);
    await writeAudit(db, userId, 'dns_check', `domain=${name}`, Date.now());
    return reply.code(201).send(ok({ domain: { id, name, ...st } }));
  });

  app.post('/api/mailboxes', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const input = mailboxIn.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ ok: false, error: input.error.issues[0]?.message ?? 'валидация ящика' });
    const quota = await planQuotaLeft(db, userId, Date.now());
    if (quota.limitMailboxes !== null && quota.usedMailboxes >= quota.limitMailboxes) {
      return reply.code(409).send({ ok: false, error: `лимит тарифа ${quota.plan}: ${quota.usedMailboxes}/${quota.limitMailboxes} ящиков` });
    }
    const b = input.data;
    const probe = cfg.demoMode
      ? { status: 'verified', diag: null }
      : await probeMailboxLive(b);
    const id = crypto.randomUUID();
    const envBlob = (await import('@grelka/secrets')).encryptSecret(cfg.masterKey, b.password);
    await db.exec(
      `INSERT INTO mailboxes (id, user_id, domain_id, address, smtp_host, smtp_port, imap_host, imap_port, login, secret_envelope, status, diag)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, userId, b.domain_id ?? null, b.address, b.smtp_host, b.smtp_port, b.imap_host, b.imap_port, b.login, envBlob, probe.status, probe.diag],
    );
    await writeAudit(db, userId, 'mailbox_add', `mailbox=${b.address} status=${probe.status}`, Date.now());
    return reply.code(201).send(ok({ mailbox: { id, address: b.address, status: probe.status, diag: probe.diag } }));
  });

  app.post('/api/mailboxes/:id/pool', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const input = poolJoinIn.safeParse(req.body);
    if (!input.success) return reply.code(409).send({ ok: false, error: 'без явного согласия участие в пуле невозможно' });
    const { id } = req.params as { id: string };
    const mb = await db.one<{ id: string; status: string; address: string }>(
      'SELECT id, status, address FROM mailboxes WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!mb) return reply.code(404).send({ ok: false, error: 'ящик не найден' });
    if (mb.status !== 'verified') return reply.code(409).send({ ok: false, error: 'ящик не verified' });
    await db.exec(
      `INSERT INTO pool_memberships (id, mailbox_id, consent_text, status) VALUES ($1,$2,$3,'active')
       ON CONFLICT (mailbox_id) DO UPDATE SET status = 'active', consent_text = EXCLUDED.consent_text, joined_at = now()`,
      [crypto.randomUUID(), id, input.data.consent_version],
    );
    await writeAudit(db, userId, 'pool_join', `mailbox=${mb.address}`, Date.now(), input.data.consent_version);
    return ok({ membership: { mailboxId: id, status: 'active' } });
  });

  app.delete('/api/mailboxes/:id/pool', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const { id } = req.params as { id: string };
    await db.exec(
      `UPDATE pool_memberships SET status = 'left', left_at = now() WHERE mailbox_id = $1 AND status = 'active'`,
      [id],
    );
    await writeAudit(db, userId, 'pool_leave', `mailboxId=${id}`, Date.now());
    return ok({ membership: { mailboxId: id, status: 'left' } });
  });

  app.get('/api/pool', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const mine = await db.rows<{ mailbox_id: string; status: string }>(
      `SELECT pm.mailbox_id, pm.status FROM pool_memberships pm JOIN mailboxes m ON m.id = pm.mailbox_id WHERE m.user_id = $1`,
      [userId]);
    const size = await poolSize(db);
    return ok({ size, my_status: mine });
  });

  app.get('/api/pool/public', async () => {
    const size = await poolSize(db);
    const day = await db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM pool_memberships WHERE joined_at >= now() - interval '1 day'`);
    return { ok: true, pool_size: size, joined_last_day: Number(day?.n ?? '0'), label: poolLabel(size), details: 'агрегаты; без доменов и личных данных' };
  });

  app.get('/api/health/:domainId', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const { domainId } = req.params as { domainId: string };
    const domain = await db.one<{ id: string; name: string; spf_status: string; dkim_status: string; dmarc_status: string }>(
      'SELECT id, name, spf_status, dkim_status, dmarc_status FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, userId]);
    if (!domain) return reply.code(404).send({ ok: false, error: 'домен не найден' });
    const ev = await db.one<{ s: string; b: string; c: string }>(
      `SELECT count(*) FILTER (WHERE status = 'sent')::text AS s,
              count(*) FILTER (WHERE status = 'bounced')::text AS b,
              (SELECT count(*)::text FROM inbound_events e
                 JOIN mailboxes m2 ON m2.id = e.mailbox_id
                WHERE e.kind = 'complaint' AND m2.domain_id = $1)::text AS c
         FROM send_log sl JOIN mailboxes m ON m.id = sl.mailbox_id
        WHERE m.domain_id = $1`, [domainId]);
    const members = await poolSize(db);
    const { computeScore } = await import('@grelka/core');
    const score = computeScore({
      spf: domain.spf_status as 'ok' | 'warn' | 'fail' | 'unknown',
      dkim: domain.dkim_status as 'ok' | 'warn' | 'fail' | 'unknown',
      dmarc: domain.dmarc_status as 'ok' | 'warn' | 'fail' | 'unknown',
      sent: Number(ev?.s ?? 0), bounced: Number(ev?.b ?? 0), complained: Number(ev?.c ?? 0),
    }, members);
    return ok({ domain: { id: domain.id, name: domain.name }, curve: await curve(db, domainId), stats: score });
  });

  app.get('/api/partner/me', async (req) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const codes = await db.rows<{ code: string; commission_pct: number }>('SELECT code, commission_pct FROM partner_codes WHERE owner_user_id = $1', [userId]);
    const comm = await db.rows<{ amount: string; currency: string; payment_external_id: string }>(
      `SELECT ce.amount::text AS amount, ce.currency, ce.payment_external_id
         FROM commission_events ce JOIN partner_codes pc ON pc.id = ce.partner_code_id
        WHERE pc.owner_user_id = $1 ORDER BY ce.created_at DESC LIMIT 50`, [userId]);
    return ok({ codes, commissions: comm });
  });

  app.post('/api/partner/codes', async (req, reply) => {
    const userId = await authUserId(cfg, req.headers.authorization as string);
    const existing = await db.one<{ code: string }>('SELECT code FROM partner_codes WHERE owner_user_id = $1', [userId]);
    if (existing) return ok({ code: existing.code, note: 'код уже существует' });
    const code = ('G' + crypto.randomUUID().slice(0, 5).toUpperCase());
    await db.exec('INSERT INTO partner_codes (id, owner_user_id, code) VALUES ($1,$2,$3)', [crypto.randomUUID(), userId, code]);
    await writeAudit(db, userId, 'partner_code', `code=${code}`, Date.now());
    return reply.code(201).send(ok({ code }));
  });

  app.get('/u/unsubscribe', async (req, reply) => {
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="ru"><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:520px;text-align:center"><h2>Отписка принята</h2><p>Обработка в пределах 48 часов; адрес уйдёт в глобальный стоп-лист (RFC 8058).</p><form method="POST" action="/u/unsubscribe"><button>Подтвердить отписку (один клик)</button></form></div></body></html>`;
  });

  app.post('/u/unsubscribe', async (req, reply) => {
    reply.header('Content-Type', 'application/json');
    const token = (req.body as { t?: string })?.t ?? ((req.query as { t?: string })?.t ?? '');
    const target = decodeToken(String(token));
    if (!target) return reply.code(400).send({ ok: false, error: 'невалидный токен отписки' });
    await db.exec(
      `INSERT INTO stoplist_entries (id, address, source, due_at) VALUES ($1,$2,'rfc8058',$3)
       ON CONFLICT (address) DO NOTHING`,
      [crypto.randomUUID(), target, new Date(Date.now() + 48 * 3600_000)],
    );
    await writeAudit(db, await silentUser(db, target), 'unsubscribe', `address=${target}`, Date.now(), 'rfc8058-v1');
    return { ok: true, message: 'отписка принята; обработка ≤ 48 часов' };
  });

  async function silentUser(dbx: Config['db'], address: string): Promise<string | null> {
    const mb = await dbx.one<{ user_id: string }>('SELECT user_id FROM mailboxes WHERE address = $1', [address]);
    return mb?.user_id ?? null;
  }
}

function decodeToken(t: string): string | null {
  try {
    const [part, sig] = t.split('.');
    if (!part || !sig) return null;
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString()) as { a?: string };
    const good = sig.length === 43;
    return good && payload.a ? payload.a : null;
  } catch { return null; }
}

function poolLabel(size: number): string {
  return size >= 25 ? 'сеть в рабочей массе' : `сеть разогревается: ${size} участников (критмасса 25)`;
}

async function poolSize(dbx: Config['db']): Promise<number> {
  const r = await dbx.one<{ n: string }>(`SELECT count(*)::text AS n FROM pool_memberships WHERE status = 'active'`);
  return Number(r?.n ?? '0');
}

function curve(db: Config['db'], domainId: string) {
  return db.rows<{ day: string; score: number }>(
    'SELECT day::text AS day, score FROM health_snapshots WHERE domain_id = $1 ORDER BY day', [domainId]);
}

async function dnsStatuses(name: string): Promise<{ spf_status: string; dkim_status: string; dmarc_status: string }> {
  const dns = await import('node:dns').then((m) => m.promises);
  const spf = (await dns.resolveTxt(name).catch(() => [] as string[][])).some(r => String(r).includes('v=spf1')) ? 'ok' : 'fail';
  const dkimRows = await dns.resolveTxt(`default._domainkey.${name}`).catch(() => [] as string[][]);
  const dkim = dkimRows.length ? 'ok' : 'warn';
  const dmarcRows = await dns.resolveTxt(`_dmarc.${name}`).catch(() => [] as string[][]);
  const dmarc = dmarcRows.some(r => String(r).includes('v=DMARC1')) ? 'ok' : 'warn';
  return { spf_status: spf, dkim_status: dkim, dmarc_status: dmarc };
}

async function probeMailboxLive(b: {
  smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; login: string; password: string;
}): Promise<{ status: string; diag: string | null }> {
  try {
    const nodemailer = await import('nodemailer');
    const t = nodemailer.createTransport({
      host: b.smtp_host, port: b.smtp_port, secure: b.smtp_port === 465,
      auth: { user: b.login, pass: b.password }, tls: { rejectUnauthorized: false },
    });
    await t.verify();
  } catch (e) {
    return { status: 'unverified', diag: `smtp: ${(e as Error).message.slice(0, 120)}` };
  }
  try {
    const { ImapFlow } = await import('imapflow');
    const c = new ImapFlow({ host: b.imap_host, port: b.imap_port, secure: b.imap_port === 993, auth: { user: b.login, pass: b.password }, logger: false });
    await c.connect();
    await c.logout();
  } catch (e) {
    return { status: 'unverified', diag: `imap: ${(e as Error).message.slice(0, 120)}` };
  }
  return { status: 'verified', diag: null };
}

export const _internal = { isRuAddress, userPlanIn: userPlan, planQuotaLeftIn: planQuotaLeft };
