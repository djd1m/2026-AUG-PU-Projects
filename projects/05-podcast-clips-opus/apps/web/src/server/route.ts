import { getRuntime } from './runtime';
import { createAuthHandler } from './auth-handler';
import { allowMutation } from './rate-limit';

export function authRoute(action: 'login' | 'register' | 'logout') {
  return async (request: Request): Promise<Response> => {
    const runtime = getRuntime();
    return createAuthHandler(action, { auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
      trustedProxyHops: runtime.config.trustedProxyHops,
      allowMutation: (ip) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret) })(request);
  };
}
