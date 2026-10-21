import { createReferralClickHandler } from '@/server/referral-handler';
import { getRuntime } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ public_id: string }> }) {
  const { config, servicePool } = getRuntime();
  return createReferralClickHandler({ servicePool, publicBaseUrl: config.PUBLIC_BASE_URL,
    visitorSecret: config.VISITOR_SECRET })(request, (await context.params).public_id);
}
