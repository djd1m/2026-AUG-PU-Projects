// /invite/{token} — приглашение студии (фича partner-and-studio, SC-US-012-2). Публичная страница: без входа — войти или
// создать аккаунт и вернуться сюда (next проверен safeNextPath). Неизвестный токен — 404. Индексация закрыта.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readInvite } from '@n6/db';
import { currentAccountId } from '../../../server/cabinet-session';
import { getRuntime } from '../../../server/runtime';
import { SiteHeader } from '../../SiteHeader';
import { requestTheme } from '../../theme-server';
import { InviteScreen } from './InviteScreen';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Приглашение студии — Суфлёр', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await readInvite(getRuntime().pool, token);
  if (!preview) notFound();
  const loggedIn = (await currentAccountId()) !== null;
  return <><SiteHeader theme={await requestTheme()} /><main className="center container">
    <InviteScreen token={token} preview={preview} loggedIn={loggedIn} /></main></>;
}
