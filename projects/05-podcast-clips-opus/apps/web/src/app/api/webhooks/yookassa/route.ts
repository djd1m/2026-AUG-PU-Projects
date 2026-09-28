// POST /api/webhooks/yookassa — уведомления ЮKassa (ЕДИНСТВЕННЫЙ вебхук продукта, ADR-019, фича 30 payments).
// Адрес для кабинета магазина: <N5_PUBLIC_ORIGIN>/api/webhooks/yookassa = https://clipmkr.ru/api/webhooks/yookassa.
// При N5_PAYMENTS_MODE не заданном или off — 404.
import { getBillingDependencies } from '../../../../server/billing-runtime';
import { createPaymentWebhookHandler } from '../../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createPaymentWebhookHandler(getBillingDependencies())(request);
}
