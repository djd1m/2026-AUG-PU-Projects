import { erasurePageState } from '../../server/erasure-page';
import { ErasureStatus } from './AccountDeletion';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getRuntime } from '../../server/runtime';
import { ThemeToggle } from '../ThemeToggle';
import { requestTheme } from '../theme-server';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const erasure = await erasurePageState();
  if (erasure) return <main className="container"><ErasureStatus {...erasure} /></main>;
  const token = (await cookies()).get('__Host-n5_session')?.value;
  if (!token || !await getRuntime().auth.authenticate(token)) redirect('/');
  return <><nav className="navigation"><Link className="brand" href="/dashboard"><span>◧</span> КлипМейкер</Link><Link href="/dashboard">Мои записи</Link><ThemeToggle initial={await requestTheme()} /></nav><main className="container">{children}</main></>;
}
