// Истечение подписки: тариф гаснет, бренд-строка ВОЗВРАЩАЕТСЯ, кэш гостя сбрасывается.
// Fail-closed уже в схеме (branding_required DEFAULT true) — этот код лишь возвращает
// значение к строгому после оплаченного периода.
import { pool } from './db.js';

const GUEST_INTERNAL_URL = process.env.GUEST_INTERNAL_URL ?? 'http://guest:3000';

export async function expireSubscriptions(): Promise<string[]> {
  const client = await pool.connect();
  const slugs: string[] = [];
  try {
    await client.query('begin');
    const expired = await client.query<{ account_id: string }>(
      `update subscriptions set status = 'expired'
        where status = 'active' and current_period_end < now()
        returning account_id`);
    if (expired.rows.length > 0) {
      const ids = expired.rows.map((r) => r.account_id);
      const upd = await client.query<{ slug: string }>(
        `update places set branding_required = true
          where account_id = any($1::uuid[]) returning slug`, [ids]);
      slugs.push(...upd.rows.map((r) => r.slug));
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally { client.release(); }
  // Инвалидация ПОСЛЕ COMMIT — тот же закон, что в вебхуке оплаты.
  await invalidateSlugs(slugs);
  return slugs;
}

export async function invalidateSlugs(slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    try {
      await fetch(`${GUEST_INTERNAL_URL}/internal/invalidate/${slug}`,
        { method: 'POST', signal: AbortSignal.timeout(3_000) });
    } catch (e) { console.error('invalidate_failed', slug, (e as Error).message); }   // кэш добьёт TTL
  }
}
