// /upgrade?plan=nobadge|studio — оформление платного плана (tariffs-and-interest, FR-TARIFF-002, SC-US-011-1, A-N6-040).
// Вход обязателен: план принадлежит аккаунту (донор N4 subscription.ts: намерение без владельца никому не принадлежит).
// Оплата не настроена (N6_PAYMENTS_MODE=off) — экран интереса без единого платёжного поля.
import { notFound, redirect } from 'next/navigation';
import { PLAN_PRICE_MINOR, formatRubles, isPaidPlan } from '@n6/rag';
import { readAccountBilling } from '@n6/db';
import { SiteHeader } from '../SiteHeader';
import { requestTheme } from '../theme-server';
import { currentAccountId } from '../../server/cabinet-session';
import { PLAN_TITLE } from '../../server/billing-handler';
import { getRuntime } from '../../server/runtime';
import { UpgradeScreen } from './UpgradeScreen';
export const dynamic = 'force-dynamic';
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = (await searchParams).plan;
  if (!isPaidPlan(plan)) notFound();
  const accountId = await currentAccountId();
  if (!accountId) redirect(`/login?next=${encodeURIComponent(`/upgrade?plan=${plan}`)}`);
  const { pool, payments } = getRuntime();
  const billing = await readAccountBilling(pool, accountId);
  if (!billing) redirect(`/login?next=${encodeURIComponent(`/upgrade?plan=${plan}`)}`);
  return <><SiteHeader theme={await requestTheme()} />
    <main className="center container"><UpgradeScreen plan={plan} title={PLAN_TITLE[plan]} price={formatRubles(PLAN_PRICE_MINOR[plan])}
      paymentsOn={payments !== null} current={billing} /></main></>;
}
