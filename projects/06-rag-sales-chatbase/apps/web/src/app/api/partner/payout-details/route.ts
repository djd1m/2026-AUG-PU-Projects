// POST /api/partner/payout-details { method: 'sbp', phone, bank? } — реквизиты выплаты партнёра (фича partner-and-studio).
import { createPayoutDetailsHandler } from '../../../../server/partner-handler';
import { getPartnerDependencies } from '../../../../server/partner-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createPayoutDetailsHandler(getPartnerDependencies())(request);
}
