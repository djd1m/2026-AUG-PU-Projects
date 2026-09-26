// GET /api/studio/summary — кабинет студии: боты и переданные клиентам, когорта по коду (фича partner-and-studio).
import { createStudioSummaryHandler } from '../../../../server/partner-handler';
import { getPartnerDependencies } from '../../../../server/partner-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return createStudioSummaryHandler(getPartnerDependencies())(request);
}
