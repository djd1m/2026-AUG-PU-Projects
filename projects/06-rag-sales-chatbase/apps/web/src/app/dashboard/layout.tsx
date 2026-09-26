// из N5: projects/05-podcast-clips-opus/apps/web/src/app/dashboard/layout.tsx (коммит 90fe80a) — адаптировано: cookie
// __Host-n6_session, без экрана удаления аккаунта (фича account-erasure); без сессии — на /login.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getRuntime } from '../../server/runtime';
import { COOKIE_NAME } from '../../server/auth-handler';
import { SiteHeader } from '../SiteHeader';
import { LogoutButton } from './LogoutButton';
import { requestTheme } from '../theme-server';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !await getRuntime().auth.authenticate(token)) redirect('/login');
  return <><SiteHeader theme={await requestTheme()} home="/dashboard"><LogoutButton /></SiteHeader><main className="center container">{children}</main></>;
}
