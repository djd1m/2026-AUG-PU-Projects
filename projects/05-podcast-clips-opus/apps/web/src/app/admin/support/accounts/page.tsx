import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supportPageState } from '../../../../server/support/page-state';
import { Accounts } from './Accounts';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function AccountsPage() {
  if (!(await supportPageState()).operator) notFound();
  return <main className="container support-shell"><h1>Диагностика аккаунтов</h1><p>Только чтение. Поиск по точной почте или UUID; не более 25 аккаунтов на странице.</p><Accounts /><a className="button secondary" href="/support">К поддержке</a></main>;
}
