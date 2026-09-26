// POST /api/webhooks/yookassa — уведомления ЮKassa (ЕДИНСТВЕННЫЙ вебхук продукта, ADR-017 дополненный, A-N6-040).
// Адрес для кабинета магазина: <N6_PUBLIC_ORIGIN>/api/webhooks/yookassa. При N6_PAYMENTS_MODE=off — 404.
import { getBillingDependencies } from '../../../../server/billing-runtime';
import { createPaymentWebhookHandler } from '../../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createPaymentWebhookHandler(getBillingDependencies())(request);
}
