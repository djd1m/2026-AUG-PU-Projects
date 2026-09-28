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
  const raw = (await searchParams).intent;
  const intent = typeof raw === 'string' && INTENT_ID.test(raw) ? raw.toLowerCase() : null;
  const token = (await cookies()).get('__Host-n5_session')?.value;
  // Без сессии — на вход С ВОЗВРАТОМ сюда же: иначе оплативший человек теряет экран подтверждения своего платежа.
  if (!token || !await auth.authenticate(token)) redirect(intent ? `/?next=${encodeURIComponent(`/upgrade/return?intent=${intent}`)}#auth` : '/#auth');
  return <><nav className="navigation"><Link className="brand" href="/dashboard"><span>◧</span> КлипМейкер</Link><Link href="/dashboard">Мои записи</Link><ThemeToggle initial={await requestTheme()} /></nav>
    <main className="container"><ReturnScreen intentId={intent ?? 'unknown'} /></main></>;
}
