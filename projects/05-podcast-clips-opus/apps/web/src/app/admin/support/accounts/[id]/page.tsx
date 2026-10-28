import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supportPageState } from '../../../../../server/support/page-state';
import { AccountCard } from './AccountCard';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await supportPageState()).operator) notFound();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <main className="container support-shell"><h1>Карточка аккаунта</h1><AccountCard id={id} /><a className="button secondary" href="/admin/support/accounts">К списку аккаунтов</a></main>;
}
