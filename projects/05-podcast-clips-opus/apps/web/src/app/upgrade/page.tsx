// Authenticated catalogue remains visible while checkout is unavailable.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readAccountBilling,readCreditPurchaseWindows } from '@clipmaker/db';
import { PAID_PLAN_DAYS, PAID_PLAN_TITLE, PAID_PRICE_MINOR, effectivePlan, formatRubles } from '@clipmaker/shared/tariff';
import { readUpgradeFrom } from '../../lib/payment-return';
import { getRuntime } from '../../server/runtime';
import { ThemeToggle } from '../ThemeToggle';
import { requestTheme } from '../theme-server';
import { UpgradeScreen } from './UpgradeScreen';
export const dynamic = 'force-dynamic';
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { config, pool, auth, payments } = getRuntime();
  const from = readUpgradeFrom((await searchParams).from);
  const login = from ? `/?next=${encodeURIComponent(`/upgrade?from=${from}`)}#auth` : '/#auth';
  const token = (await cookies()).get('__Host-n5_session')?.value;
  const session = token ? await auth.authenticate(token) : null;
  if (!session) redirect(login);
  const billing = await readAccountBilling(pool, session.account_id);
  if (!billing) redirect(login);
  const purchaseWindows=billing.billing_policy==='credits_v1' ? await readCreditPurchaseWindows(pool,session.account_id) : null;
  const plan = billing.effective_plan ?? effectivePlan(billing.plan, billing.plan_source, billing.plan_paid_until, new Date());
  return <><nav className="navigation"><Link className="brand" href="/dashboard"><span>◧</span> КлипМейкер</Link><Link href="/dashboard">Мои записи</Link><ThemeToggle initial={await requestTheme()} /></nav>
    <main className="container"><UpgradeScreen ownerUnlimited={billing.owner_unlimited === true} purchaseWindows={purchaseWindows ?? undefined} creditMode={true} catalogOnly={billing.billing_policy!=='credits_v1'} salesEnabled={!!payments && config.billingMode==='credits_v1' && billing.billing_policy==='credits_v1'} title={PAID_PLAN_TITLE} price={formatRubles(PAID_PRICE_MINOR)} days={PAID_PLAN_DAYS}
      paidMinutes={config.limits.N5_LIMIT_PAID_USER_MINUTES} current={{ plan, plan_source: billing.plan_source, plan_paid_until: billing.plan_paid_until }} /></main></>;
}
