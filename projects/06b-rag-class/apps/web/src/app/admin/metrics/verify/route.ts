import { after } from 'next/server';
import { createMetricVerifyHandler } from '@/server/metrics-handler';
import { getRuntime } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  const { config, servicePool, auth } = getRuntime();
  return createMetricVerifyHandler({ servicePool, publicBaseUrl: config.PUBLIC_BASE_URL,
    cursorSecret: config.SESSION_SECRET, authenticate: (token) => auth.authenticate(token), after })(request);
}
