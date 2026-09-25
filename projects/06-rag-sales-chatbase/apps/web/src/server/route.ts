// из N5: projects/05-podcast-clips-opus/apps/web/src/server/route.ts — без trustedProxyHops
import { getRuntime } from './runtime';
import { createAuthHandler } from './auth-handler';
import { allowMutation } from './rate-limit';

export function authRoute(action: 'login' | 'register' | 'logout') {
  return async (request: Request): Promise<Response> => {
    const runtime = getRuntime();
    return createAuthHandler(action, { auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
      allowMutation: (ip, account) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret, account) })(request);
  };
}
