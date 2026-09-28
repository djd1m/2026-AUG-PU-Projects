// POST /api/checkout { idempotency_key } — оформление тарифа paid (фича 30 payments, ADR-019). При off — 404.
import { getBillingDependencies } from '../../../server/billing-runtime';
import { createCheckoutHandler } from '../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createCheckoutHandler(getBillingDependencies())(request);
}
