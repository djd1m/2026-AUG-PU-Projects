// /dashboard/studio — кабинет студии (фича partner-and-studio). Аккаунт — ТОЛЬКО из сессии.
import { readStudioCabinet } from '@n6/db';
import { currentAccountId } from '../../../server/cabinet-session';
import { getRuntime } from '../../../server/runtime';
import { StudioScreen } from './StudioScreen';
export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  const accountId = await currentAccountId();
  const runtime = getRuntime();
  const cabinet = accountId ? await readStudioCabinet(runtime.pool, accountId) : null;
  if (!cabinet) return <p role="alert" className="notice danger-notice">Кабинет недоступен. Войдите заново.</p>;
  return <StudioScreen cabinet={cabinet} origin={new URL(runtime.config.publicOrigin).origin} />;
}
