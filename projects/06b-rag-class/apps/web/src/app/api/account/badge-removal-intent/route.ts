import { createBadgeRemovalHandler } from '@/server/referral-handler';
import { getRuntime } from '@/server/runtime';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const { config, servicePool, auth } = getRuntime();
  return createBadgeRemovalHandler({ servicePool, publicBaseUrl: config.PUBLIC_BASE_URL,
    authenticate: (token) => auth.authenticate(token) })(request);
}
