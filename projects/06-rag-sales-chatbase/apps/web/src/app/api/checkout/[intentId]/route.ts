// GET /api/checkout/{intent_id} — состояние оплаты для экрана возврата (pending | succeeded | canceled).
import { getBillingDependencies } from '../../../../server/billing-runtime';
import { createCheckoutStatusHandler } from '../../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ intentId: string }> }): Promise<Response> {
  return createCheckoutStatusHandler(getBillingDependencies())(request, (await context.params).intentId);
}
