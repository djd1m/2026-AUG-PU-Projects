import { loadConfig } from '../../api/src/config.ts';
import type { Config } from '../../api/src/config.ts';
import { classifyInbound, applyInboundEffect } from '@grelka/core';
import { ImapFlow } from 'imapflow';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function imapPollTick(cfg: Config): Promise<{ processed: number; skipped: 'demo' | 'real' }> {
  if (cfg.demoMode) return { processed: 0, skipped: 'demo' };
  const mailboxes = await cfg.db.rows<{ id: string; address: string; imap_host: string; imap_port: number; login: string; secret_envelope: Buffer; user_id: string }>(
    `SELECT id, address, imap_host, imap_port, login, secret_envelope, user_id FROM mailboxes WHERE status = 'verified'`, []);
  let processed = 0;
  for (const mb of mailboxes) {
    try {
      const pass = (await import('@grelka/secrets')).decryptSecret(cfg.masterKey, mb.secret_envelope);
      const client = new ImapFlow({
        host: mb.imap_host, port: mb.imap_port, secure: mb.imap_port === 993,
        auth: { user: mb.login, pass }, logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch({ seen: false }, { envelope: true, headers: true, uid: true })) {
          const hd = (await msg.headers) ?? '';
          const headers = String(hd).toString().toLowerCase();
          const cls = classifyInbound({
            from: msg.envelope?.from?.[0]?.address ?? '',
            listUnsubscribePost: headers.includes('list-unsubscribe=one-click') ? 'List-Unsubscribe=One-Click' : undefined,
            autoSubmitted: headers.includes('auto-submitted: auto-replied') ? 'auto-replied' : undefined,
            feedbackType: headers.match(/feedback-type:\s*(\S+)/i)?.[1],
          }, Date.now());
          const stoplistDue = Date.now() + 48 * 3600_000;
          const stores = {
            async stoplistEnqueue(address: string, kind: string, dueAtMs: number) {
              await cfg.db.exec(
                `INSERT INTO stoplist_entries (id, address, source, due_at) VALUES (gen_random_uuid(), $1, $2, $3)
                 ON CONFLICT (address) DO NOTHING`,
                [address, kind === 'complaint' ? 'rfc8058' : 'link_unsub', new Date(dueAtMs)],
              );
            },
            async freezeRecipient(address: string) {
              await cfg.db.exec(`UPDATE recipients SET replied_at = now() WHERE address = $1`, [address]);
            },
            async isCampaignRecipient(address: string) {
              const r = await cfg.db.one('SELECT true AS ok FROM recipients WHERE address = $1 LIMIT 1', [address]);
              return Boolean(r);
            },
          };
          await applyInboundEffect(cls, stores, stoplistDue);
          await cfg.db.exec(
            `INSERT INTO inbound_events (id, campaign_id, mailbox_id, sender_address, kind, occurred_at)
             VALUES (gen_random_uuid(), NULL, $1, $2, $3, now())`,
            [mb.id, cls.senderAddress, cls.kind],
          );
          processed++;
          void msg.uid;
        }
      } finally {
        lock.release();
        void client.logout().catch(() => undefined);
      }
    } catch (e) {
      console.error(`[imap] ${mb.address}: ${(e as Error).message}`);
    }
  }
  return { processed, skipped: 'real' };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('index.ts')) {
  (async () => {
    const cfg = await loadConfig();
    while (true) {
      try { await imapPollTick(cfg); } catch (e) { console.error('[imap]', (e as Error).message); }
      await sleep(cfg.imapPollSec * 1000);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
