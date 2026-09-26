// /upgrade/return?intent=<id> — адрес возврата, который получает ЮKassa (return_url, createPayment). Состояние читается
// по идентификатору намерения; вход обязателен (чужое намерение — «не найдено»).
import { redirect } from 'next/navigation';
import { SiteHeader } from '../../SiteHeader';
import { requestTheme } from '../../theme-server';
import { currentAccountId } from '../../../server/cabinet-session';
import { ReturnScreen } from './ReturnScreen';
export const dynamic = 'force-dynamic';
const INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function UpgradeReturnPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const intent = (await searchParams).intent;
  if (!(await currentAccountId())) redirect('/login');
  return <><SiteHeader theme={await requestTheme()} />
    <main className="center container"><ReturnScreen intentId={typeof intent === 'string' && INTENT_ID.test(intent) ? intent : 'unknown'} /></main></>;
}
