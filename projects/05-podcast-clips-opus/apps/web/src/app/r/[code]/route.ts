import { getRuntime } from '../../../server/runtime';
import { PartnerLandingService, createPartnerLandingHandler } from '../../../server/partner-landing';
import { allowRead } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { config, pool, auth, redis } = getRuntime();
  return createPartnerLandingHandler({ links: new PartnerLandingService(pool), auth,
    trustedProxyHops: config.trustedProxyHops, referralSecret: config.sessionSecret,
    allowRead: (ip, account) => allowRead(redis, ip, config.sessionSecret, account),
  })(request, (await params).code);
}
