import { loadConfig } from '../../api/src/config.ts';
import type { Config } from '../../api/src/config.ts';
import { InProcessQueue } from '@grelka/queue';
import { dispatchSend } from '@grelka/core';
import { decryptSecret } from '@grelka/secrets';
import nodemailer from 'nodemailer';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function campaignTick(cfg: Config): Promise<void> {
  const queue = cfg.queue;
  if (!queue) return;
  await queue.tick();
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('index.ts')) {
  (async () => {
    const cfg = await loadConfig();
    const queue = cfg.queue ?? new InProcessQueue();
    cfg.queue = queue;
    queue.register('campaign:send', async (data: unknown) => {
      const j = data as { mailboxId: string; idempotencyKey: string; campaignId: string | null; recipient: string; slotDate: string };
      const mb = await cfg.db.one<{ address: string; smtp_host: string; smtp_port: number; login: string; secret_envelope: Buffer }>(
        'SELECT address, smtp_host, smtp_port, login, secret_envelope FROM mailboxes WHERE id = $1', [j.mailboxId]);
      if (!mb) return;
      const stop = await cfg.db.one('SELECT true AS ok FROM stoplist_entries WHERE address = $1', [j.recipient]);
      if (stop) return;
      if (cfg.demoMode || cfg.smtpDemo) {
        await cfg.db.one(
          `INSERT INTO send_log (id, campaign_id, mailbox_id, idempotency_key, slot_at, status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamptz, 'sent')
           ON CONFLICT (idempotency_key) DO NOTHING RETURNING 'ok' AS _`,
          [j.campaignId, j.mailboxId, j.idempotencyKey, `${j.slotDate}T09:00:00Z`],
        );
        return;
      }
      const pass = decryptSecret(cfg.masterKey, mb.secret_envelope);
      const transport = nodemailer.createTransport({
        host: mb.smtp_host, port: mb.smtp_port, secure: mb.smtp_port === 465, auth: { user: mb.login, pass },
      });
      await dispatchSend(
        {
          idempotencyKey: j.idempotencyKey, mailboxId: j.mailboxId, to: j.recipient,
          subject: 'Сообщение от наших кампаний',
          bodyText: 'Сообщение кампании. В футере — отписка: пройдите по ссылке ниже.',
          bodyHtml: `<p>Сообщение кампании.</p><p><a href="#" data-unsub>Отписаться</a></p>`,
          isWarmup: false,
        },
        {
          transport: { async send(attempt) { await transport.sendMail({ from: mb.address, to: attempt.to, subject: attempt.subject, text: attempt.bodyText, html: attempt.bodyHtml }); return { status: 'sent' as const }; } },
          logs: {
            async hasKey(k) { return Boolean(await cfg.db.one('SELECT true AS ok FROM send_log WHERE idempotency_key = $1', [k])); },
            async insert(r) {
              await cfg.db.exec(
                `INSERT INTO send_log (id, campaign_id, mailbox_id, idempotency_key, slot_at, status, error_code)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamptz, $5, $6) ON CONFLICT (idempotency_key) DO NOTHING`,
                [r.campaignId, r.mailboxId, r.idempotencyKey, r.slotAt, r.status, r.errorCode],
              );
            },
          },
          locks: { async acquire() { return true; }, async release() {} },
          quota: {
            async remaining(mailboxId) {
              const r = await cfg.db.one<{ n: string }>(
                `SELECT count(*)::text AS n FROM send_log WHERE mailbox_id = $1 AND slot_at::date = current_date`, [mailboxId]);
              return 100 - Number(r?.n ?? '0');
            },
            async decrement() {},
          },
          campaignId: j.campaignId,
          slotAt: j.slotDate,
        },
      );
    });
    while (true) {
      try { await campaignTick(cfg); } catch (e) { console.error('[campaign]', (e as Error).message); }
      await sleep(500);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
