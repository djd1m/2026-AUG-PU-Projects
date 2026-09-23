import { getRuntime } from '../../../server/runtime';
import { GuestPackService } from '../../../server/guest-pack';
import { createGuestPageHandler } from '../../../server/guest-page';
import { allowRead } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ guest_code: string }> }) {
  const { config, pool, auth, redis } = getRuntime();
  return createGuestPageHandler({ guests: new GuestPackService(pool), auth,
    trustedProxyHops: config.trustedProxyHops, referralSecret: config.sessionSecret,
    allowRead: (ip, account) => allowRead(redis, ip, config.sessionSecret, account),
  })(request, (await params).guest_code);
}
