// /upgrade?from=clip_card|partner_dashboard|guest_page — оформление тарифа Pro (фича 30 payments, ADR-019, OWN-019).
// Донор — N6 apps/web/src/app/upgrade/page.tsx, адаптировано. Оплата выключена (N5_PAYMENTS_MODE не задан или off) —
// страницы НЕТ (404): карточки при off показывают прежний экран интереса (AC-1). Вход обязателен: намерение без владельца
// никому не принадлежит; без сессии — на вход с возвратом сюда (только закрытый набор `from`).
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { readAccountBilling } from '@clipmaker/db';
import { PAID_PLAN_DAYS, PAID_PLAN_TITLE, PAID_PRICE_MINOR, effectivePlan, formatRubles } from '@clipmaker/shared/tariff';
import { readUpgradeFrom } from '../../lib/payment-return';
import { getRuntime } from '../../server/runtime';
import { ThemeToggle } from '../ThemeToggle';
import { requestTheme } from '../theme-server';
import { UpgradeScreen } from './UpgradeScreen';
export const dynamic = 'force-dynamic';
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { config, pool, auth, payments } = getRuntime();
  if (!payments) notFound();
  const from = readUpgradeFrom((await searchParams).from);
  const login = from ? `/?next=${encodeURIComponent(`/upgrade?from=${from}`)}#auth` : '/#auth';
  const token = (await cookies()).get('__Host-n5_session')?.value;
  const session = token ? await auth.authenticate(token) : null;
  if (!session) redirect(login);
  const billing = await readAccountBilling(pool, session.account_id);
  if (!billing) redirect(login);
  const plan = effectivePlan(billing.plan, billing.plan_source, billing.plan_paid_until, new Date());
  return <><nav className="navigation"><Link className="brand" href="/dashboard"><span>◧</span> КлипМейкер</Link><Link href="/dashboard">Мои записи</Link><ThemeToggle initial={await requestTheme()} /></nav>
    <main className="container"><UpgradeScreen title={PAID_PLAN_TITLE} price={formatRubles(PAID_PRICE_MINOR)} days={PAID_PLAN_DAYS}
      paidMinutes={config.limits.N5_LIMIT_PAID_USER_MINUTES} current={{ plan, plan_source: billing.plan_source, plan_paid_until: billing.plan_paid_until }} /></main></>;
}
