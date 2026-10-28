import type { Metadata } from 'next';
import { supportPageState } from '../../server/support/page-state';
import { SupportPanel } from './SupportPanel';
import { SignOut } from './SignOut';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ videoId?: string }> }) {
  const state = await supportPageState(), { videoId } = await searchParams;
  return <main className="container support-shell"><h1>Поддержка и доступ</h1>
    <SupportPanel support={state.support} account={state.account} videoId={videoId} />
    <section className="auth-card support-card"><h2>Помощь с аккаунтом</h2><nav className="support-links" aria-label="Помощь с аккаунтом"><a href="/verify-email">Подтвердить почту</a><a href="/forgot">Забыли пароль?</a><a href="/#auth">Войти</a><a href="/dashboard">Кабинет</a>{state.operator && <a href="/admin/support/accounts">Диагностика аккаунтов</a>}</nav>{state.account && <SignOut />}</section>
  </main>;
}
