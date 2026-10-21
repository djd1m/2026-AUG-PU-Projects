import { createStudioClientHandler } from '@/server/studio-handler';
import { getRuntime } from '@/server/runtime';

export const runtime = 'nodejs';
export function POST(request: Request): Promise<Response> {
  const { auth, servicePool, config } = getRuntime();
  return createStudioClientHandler({ servicePool, publicBaseUrl: config.PUBLIC_BASE_URL,
    authenticate: (token) => auth.authenticate(token) })(request);
}
