import { createBotHandler } from '@/server/bots-handler';
import { getRuntime } from '@/server/runtime';
export const runtime = 'nodejs';
export function POST(request: Request): Promise<Response> {
  const { auth, tenantPool, config } = getRuntime();
  return createBotHandler({ tenantPool, publicBaseUrl: config.PUBLIC_BASE_URL,
    authenticate: (token) => auth.authenticate(token) })(request);
}
