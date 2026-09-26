// из N5: projects/05-podcast-clips-opus/apps/web/src/server/route.ts — без trustedProxyHops; + ClaimPreview при регистрации/входе (preview-flow)
import { getRuntime } from './runtime';
import { createAuthHandler } from './auth-handler';
import { allowMutation } from './rate-limit';
import { claimPreview } from '@n6/db';
import { createRegistrationClaim } from './preview-handler';

export function authRoute(action: 'login' | 'register' | 'logout') {
  return async (request: Request): Promise<Response> => {
    const runtime = getRuntime();
    // Предпросмотр сохраняется при регистрации и входе (preview-flow); выход — без него.
    const claim = action === 'logout' ? undefined : createRegistrationClaim({ secret: runtime.config.sessionSecret,
      authenticate: (token) => runtime.auth.authenticate(token), claim: (input) => claimPreview(runtime.pool, input) });
    return createAuthHandler(action, { auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
      allowMutation: (ip, account) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret, account), claimPreview: claim })(request);
  };
}
