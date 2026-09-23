import { cookies } from 'next/headers';
import { getRuntime } from './runtime';
import { ERASURE_COOKIE, readErasureReceipt } from './erasure-receipt';
export async function erasurePageState() {
  const jar = await cookies(), runtime = getRuntime();
  const session = jar.get('__Host-n5_session')?.value;
  if (session && await runtime.auth.authenticate(session)) return null;
  const account = readErasureReceipt(jar.get(ERASURE_COOKIE)?.value, runtime.config.sessionSecret);
  if (!account) return null;
  const row = (await runtime.pool.query<{ status: 'erasing' | 'deleted'; erase_deadline: Date }>(
    "SELECT status,erase_deadline FROM account WHERE id=$1 AND status IN ('erasing','deleted')", [account])).rows[0];
  return row ? { status: row.status, deadline: row.erase_deadline.toISOString() } : null;
}
