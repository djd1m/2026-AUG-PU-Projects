import type { Config } from './config.ts';

/** Демо-хелперы: очередь-обработчики и сид сетевой критмассы. Живут ТОЛЬКО в DEMO_MODE=1. */
export async function setup(cfg: Config): Promise<void> {
  if (!cfg.demoMode || !cfg.queue) return;
  const db = cfg.db;
  cfg.queue.register('campaign:send', async (data: unknown) => {
    const j = data as { campaignId: string | null; mailboxId: string; idempotencyKey: string; slotDate: string; recipient: string };
    await db.one(
      `INSERT INTO send_log (id, campaign_id, mailbox_id, idempotency_key, slot_at, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamptz, 'sent')
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING 'ok' AS _`,
      [j.campaignId, j.mailboxId, j.idempotencyKey, `${j.slotDate}T09:00:00Z`],
    );
  });
  cfg.queue.register('warmup:pair', async (data: unknown) => {
    const j = data as { senderId: string; recipientId: string; idempotencyKey: string; slotDate: string };
    await db.one(
      `INSERT INTO warmup_pairs (id, sender_mailbox_id, recipient_mailbox_id, sender_user_id, recipient_user_id, slot_date, status, idempotency_key)
       SELECT gen_random_uuid(), $1, $2, (SELECT user_id FROM mailboxes WHERE id = $1), (SELECT user_id FROM mailboxes WHERE id = $2), $3::date, 'sent', $4
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING 'ok' AS _`,
      [j.senderId, j.recipientId, j.slotDate, j.idempotencyKey],
    );
  });
  await seedHealthDemo(db);
}

async function seedHealthDemo(db: Config['db']): Promise<void> {
  await db.exec(
    `INSERT INTO health_snapshots (id, domain_id, day, score, delivered_pct, spam_rate, pool_members)
     SELECT gen_random_uuid(), d.id, day::date, 40, 82, 0.0005, (SELECT count(*) FROM pool_memberships WHERE status = 'active')
       FROM domains d, generate_series(current_date - 13, current_date, interval '1 day') day
     ON CONFLICT (domain_id, day) DO NOTHING`,
  );
  await db.exec(
    `WITH ranked AS (
       SELECT id, (row_number() OVER (ORDER BY day)) - 1 AS rn FROM health_snapshots
     )
     UPDATE health_snapshots h
        SET score = 40 + round(28 * r.rn / 13.0)::int,
            delivered_pct = 82 + round(14 * r.rn / 13.0)::int
       FROM ranked r WHERE h.id = r.id`,
  );
}
