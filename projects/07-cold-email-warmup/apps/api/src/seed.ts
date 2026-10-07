import { openDb } from '@grelka/db';
import { generateMasterKeyHex } from '@grelka/secrets';

const MASTER = process.env.MASTER_KEY ?? generateMasterKeyHex();

const demoPassword = process.env.DEMO_PASSWORD ?? 'demo-password-1';

const SEED_DOMAINS: string[] = [];
for (let i = 1; i <= 3; i++) SEED_DOMAINS.push(`warm-seed-${i}.example`);

const SEED_MAILBOXES_PER_DOMAIN = 2;
const SEED_TOTAL = Number(process.env.SEED_POOL_SIZE ?? 25);

async function main(): Promise<void> {
  if (!process.env.DEMO_MODE) {
    console.error('seed работает только в DEMO_MODE=1 (чтобы не плодить фейковые ящики в проде)');
    process.exit(1);
  }
  const driver = await openDb();
  const db = driver.db;
  for (const [di, d] of SEED_DOMAINS.entries()) {
    await db.exec(
      `INSERT INTO domains (id, user_id, name, spf_status, dkim_status, dmarc_status, dns_checked_at)
       VALUES ($1, $2, $3, 'ok', 'ok', 'ok', now()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), await ownerUserId(db), d],
    );
    const dom = await db.one<{ id: string }>('SELECT id FROM domains WHERE name = $1', [d]);
    for (let mi = 1; mi <= SEED_MAILBOXES_PER_DOMAIN; mi++) {
      const address = `seed${((di * SEED_MAILBOXES_PER_DOMAIN) + mi)}@${d}`;
      const id = crypto.randomUUID();
      const { encryptSecret } = await import('@grelka/secrets');
      await db.exec(
        `INSERT INTO mailboxes (id, user_id, domain_id, address, smtp_host, smtp_port, imap_host, imap_port, login, secret_envelope, status)
         VALUES ($1,$2,$3,$4,'smtp.seed.local',465,'imap.seed.local',993,'seed',$5,'verified')
         ON CONFLICT (address) DO NOTHING`,
        [id, await ownerUserId(db), dom!.id, address, encryptSecret(Buffer.from(MASTER, 'hex'), demoPassword)],
      );
      const mb = await db.one<{ id: string }>('SELECT id FROM mailboxes WHERE address = $1', [address]);
      if (mb) {
        await db.exec(
          `INSERT INTO pool_memberships (id, mailbox_id, consent_text, status)
           SELECT gen_random_uuid(), $1, 'seed-consent-v1', 'active' WHERE NOT EXISTS (
             SELECT 1 FROM pool_memberships WHERE mailbox_id = $1)`,
          [mb.id],
        );
      }
    }
  }
  const need = Math.max(0, SEED_TOTAL - (await poolCount(db)));
  let extra = 0;
  const { InProcessQueue } = await import('@grelka/queue');
  void InProcessQueue;
  console.log(`seed: домены ${SEED_DOMAINS.length}, ящиков в пуле сейчас ${await poolCount(db)}; дополнить до ${SEED_TOTAL}: ${need} (расширение — не в seed, сеть наберётся участниками когорты)`);
  await driver.close();
}

async function poolCount(db: Awaited<ReturnType<typeof openDb>>['db']): Promise<number> {
  const r = await db.one<{ n: string }>(`SELECT count(*)::text AS n FROM pool_memberships WHERE status = 'active'`);
  return Number(r?.n ?? '0');
}

async function ownerUserId(db: Awaited<ReturnType<typeof openDb>>['db']): Promise<string> {
  const u = await db.one<{ id: string }>(`SELECT id FROM users ORDER BY created_at LIMIT 1`);
  if (u) return u.id;
  const { hashPassword } = await import('@grelka/core');
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO users (id, email, password_record, role, email_confirmed_at)
     VALUES ($1,'owner@demo.local',$2,'owner', now())`,
    [id, await hashPassword(demoPassword)],
  );
  return id;
}

main().catch((e) => { console.error(e); process.exit(1); });
