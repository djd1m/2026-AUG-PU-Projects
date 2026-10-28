import type { Metadata } from 'next';
import { supportPageState } from '../../server/support/page-state';
import { RecoveryForm } from '../support/RecoveryForm';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function Page() {
  const state = await supportPageState();
  return <main className="container support-shell"><RecoveryForm mode="forgot" account={state.account} mailAvailable={state.mailAvailable} /></main>;
}
