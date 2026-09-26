// POST /api/checkout { plan, idempotency_key } — оформление платного плана (tariffs-and-interest, A-N6-040).
import { getBillingDependencies } from '../../../server/billing-runtime';
import { createCheckoutHandler } from '../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createCheckoutHandler(getBillingDependencies())(request);
}
