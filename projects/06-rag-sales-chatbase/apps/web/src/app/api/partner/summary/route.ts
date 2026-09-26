// GET /api/partner/summary — кабинет партнёра: код, когорта, деньги (фича partner-and-studio).
import { createPartnerSummaryHandler } from '../../../../server/partner-handler';
import { getPartnerDependencies } from '../../../../server/partner-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return createPartnerSummaryHandler(getPartnerDependencies())(request);
}
