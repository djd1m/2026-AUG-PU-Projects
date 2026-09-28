// /upgrade/return?intent=<id> — адрес возврата, который получает ЮKassa (return_url, createPayment). Состояние читается
// по идентификатору намерения, выданному ДО ухода к провайдеру; вход обязателен (чужое намерение — «не найдено»).
// Донор — N6 apps/web/src/app/upgrade/return/page.tsx, адаптировано (фича 30 payments). При off — 404.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getRuntime } from '../../../server/runtime';
import { ThemeToggle } from '../../ThemeToggle';
import { requestTheme } from '../../theme-server';
import { ReturnScreen } from './ReturnScreen';
export const dynamic = 'force-dynamic';
const INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function UpgradeReturnPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const { auth, payments } = getRuntime();
  if (!payments) notFound();
  const intent = (await searchParams).intent;
  const token = (await cookies()).get('__Host-n5_session')?.value;
  if (!token || !await auth.authenticate(token)) redirect('/#auth');
  return <><nav className="navigation"><Link className="brand" href="/dashboard"><span>◧</span> КлипМейкер</Link><Link href="/dashboard">Мои записи</Link><ThemeToggle initial={await requestTheme()} /></nav>
    <main className="container"><ReturnScreen intentId={typeof intent === 'string' && INTENT_ID.test(intent) ? intent : 'unknown'} /></main></>;
}
