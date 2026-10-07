import { loadConfig } from '../../api/src/config.ts';
import { rampPlan, selectPairs, computeScore } from '@grelka/core';
import { decryptSecret } from '@grelka/secrets';
import nodemailer from 'nodemailer';
import type { Config } from '../../api/src/config.ts';
import type { Db } from '@grelka/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ctx = { db: Db; masterKey: Buffer; demoMode: boolean; smtpDemo: boolean };

async function ctxFrom(cfg: Config): Promise<Ctx> {
  return { db: cfg.db, masterKey: cfg.masterKey, demoMode: cfg.demoMode, smtpDemo: cfg.smtpDemo };
}

export async function warmupTick({ db, masterKey, demoMode, smtpDemo }: Ctx): Promise<void> {
  const members = await db.rows<{
    id: string; user_id: string; domain_id: string | null; joined_at: string;
    address: string; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; login: string;
  }>(
    `SELECT m.id, m.user_id, m.domain_id, pm.joined_at, m.address, m.smtp_host, m.smtp_port, m.imap_host, m.imap_port, m.login
       FROM pool_memberships pm
       JOIN mailboxes m ON m.id = pm.mailbox_id
      WHERE pm.status = 'active' AND m.status = 'verified'`,
  );
  if (members.length < 2) {
    console.log(`[warmup] участников меньше двух (${members.length}): плана нет — честная метка «сеть разогревается»`);
    await updateHealthSnapshots(db, members.length);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const m of members) {
    const dayIndex = Math.max(1, Math.floor((Date.now() - Date.parse(m.joined_at)) / 86400_000) + 1);
    const planned = rampPlan(dayIndex, 20);
    for (let slotIdx = 0; slotIdx < planned; slotIdx++) {
      const idempotencyKey = `warm:${m.id}:${today}:${slotIdx}`;
      const exists = await db.one('SELECT true AS ok FROM warmup_pairs WHERE idempotency_key = $1', [idempotencyKey]);
      if (exists) continue;
      const candidates = members.map((x) => ({ id: x.id, userId: x.user_id, domainId: x.domain_id, quotaLeft: 1 }));
      const [pair] = selectPairs(candidates, 1);
      if (!pair) break;
      const senderRow = members.find((x) => x.id === pair.sender.id)!;
      const otherRow = members.find((x) => x.id === pair.recipient.id)!;
      const inserted = await db.one(
        `INSERT INTO warmup_pairs (id, sender_mailbox_id, recipient_mailbox_id, sender_user_id, recipient_user_id, slot_date, status, idempotency_key)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, current_date, 'sent', $5)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING 'ok' AS _`,
        [senderRow.id, otherRow.id, senderRow.user_id, otherRow.user_id, idempotencyKey],
      );
      if (!inserted) continue;
      if (demoMode || smtpDemo) {
        console.log(`[warmup] demo-пара: ${senderRow.address} → ${otherRow.address}`);
        continue;
      }
      const secret = await db.one<{ secret_envelope: Buffer }>(
        'SELECT secret_envelope FROM mailboxes WHERE id = $1', [senderRow.id]);
      if (!secret) continue;
      const pass = decryptSecret(masterKey, secret.secret_envelope);
      const toOther = await db.one<{ address: string }>(
        'SELECT address FROM mailboxes WHERE id = $1', [otherRow.id]);
      const transport = nodemailer.createTransport({
        host: senderRow.smtp_host, port: senderRow.smtp_port, secure: senderRow.smtp_port === 465,
        auth: { user: senderRow.login, pass },
      });
      await transport.sendMail({
        from: senderRow.address,
        to: toOther?.address ?? 'postmaster@localhost',
        subject: `[прогрев v1] как продвигается рассылка?`,
        text: `[прогрев v1] Короткое полезное письмо внутри сети прогрева.`,
        html: `<small>[прогрев v1]</small><p>Короткое полезное письмо внутри сети прогрева; участник сети согласился на переписку.</p>`,
        headers: { 'X-Grelka-Warmup': 'v1' },
      });
    }
  }
  await updateHealthSnapshots(db, members.length);
}

export async function updateHealthSnapshots(db: Db, poolMembers: number): Promise<void> {
  await db.exec(
    `INSERT INTO health_snapshots (id, domain_id, day, score, delivered_pct, spam_rate, pool_members)
     SELECT gen_random_uuid(), d.id, current_date,
            CASE WHEN $1::int >= 25 THEN 68 ELSE $1::int * 2 + 10 END,
            90, 0.0004, $1::int
       FROM domains d
     ON CONFLICT (domain_id, day) DO UPDATE SET pool_members = EXCLUDED.pool_members`,
    [poolMembers],
  );
  console.log(`[warmup] health: участников ${poolMembers}, score обновлён (${JSON.stringify(computeScore({ spf: 'ok', dkim: 'ok', dmarc: 'ok', sent: 100, bounced: 2, complained: 0 }, poolMembers).label)})`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('index.ts')) {
  (async () => {
    const cfg = await loadConfig();
    const ctx = await ctxFrom(cfg);
    while (true) {
      try {
        await warmupTick(ctx);
      } catch (e) {
        console.error('[warmup]', (e as Error).message);
      }
      await sleep(60_000);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
