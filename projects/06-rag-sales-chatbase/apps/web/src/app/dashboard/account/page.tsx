// /dashboard/account — удаление аккаунта (фича account-erasure). Аккаунт — ТОЛЬКО из сессии (layout уже отправил без сессии
// на /login). Последствия считаются на сервере по текущему состоянию аккаунта (readErasurePreview).
import { readErasurePreview } from '@n6/db';
import { redirect } from 'next/navigation';
import { currentAccountId } from '../../../server/cabinet-session';
import { getRuntime } from '../../../server/runtime';
import { AccountScreen } from './AccountScreen';
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const accountId = await currentAccountId();
  const preview = accountId ? await readErasurePreview(getRuntime().pool, accountId) : null;
  if (!preview) redirect('/login');
  return <AccountScreen preview={preview} />;
}
