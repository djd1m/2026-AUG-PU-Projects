// /dashboard/partner — кабинет партнёра (фича partner-and-studio). Аккаунт — ТОЛЬКО из сессии (layout уже отправил без
// сессии на /login). Нет кода — не партнёр: как им стать (код выдаёт оператор, студия получает код при первой передаче).
import { readPartnerCabinet } from '@n6/db';
import { currentAccountId } from '../../../server/cabinet-session';
import { getRuntime } from '../../../server/runtime';
import { NotPartner, PartnerScreen } from './PartnerScreen';
export const dynamic = 'force-dynamic';

export default async function PartnerPage() {
  const accountId = await currentAccountId();
  const runtime = getRuntime();
  const cabinet = accountId ? await readPartnerCabinet(runtime.pool, accountId) : null;
  return cabinet ? <PartnerScreen cabinet={cabinet} origin={new URL(runtime.config.publicOrigin).origin} /> : <NotPartner />;
}
