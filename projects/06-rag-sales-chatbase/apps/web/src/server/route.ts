// из N5: projects/05-podcast-clips-opus/apps/web/src/server/route.ts — без trustedProxyHops; + ClaimPreview при регистрации/входе (preview-flow);
// + приход по бейджу при регистрации (public-page-and-summary)
import { getRuntime } from './runtime';
import { createAuthHandler } from './auth-handler';
import { allowMutation } from './rate-limit';
import { claimPreview, recordArrival } from '@n6/db';
import { createRegistrationClaim } from './preview-handler';
import { readArrivalCookie } from '../lib/arrival';

// Приход: аккаунт — ТОЛЬКО из только что выданной сессии, значение — из cookie прихода, проверенное по закрытой форме.
export function createArrivalRecorder(deps: { authenticate: (token: string) => Promise<{ account_id: string } | null>;
  record: (accountId: string, from: string) => Promise<boolean> }) {
  return async (request: Request, sessionToken: string): Promise<void> => {
    const from = readArrivalCookie(request.headers.get('cookie'));
    if (!from) return;
    const session = await deps.authenticate(sessionToken);
    if (session) await deps.record(session.account_id, from);
  };
}

export function authRoute(action: 'login' | 'register' | 'logout') {
  return async (request: Request): Promise<Response> => {
    const runtime = getRuntime();
    // Предпросмотр сохраняется при регистрации и входе (preview-flow); выход — без него.
    const claim = action === 'logout' ? undefined : createRegistrationClaim({ secret: runtime.config.sessionSecret,
      authenticate: (token) => runtime.auth.authenticate(token), claim: (input) => claimPreview(runtime.pool, input) });
    const arrival = action === 'register' ? createArrivalRecorder({ authenticate: (token) => runtime.auth.authenticate(token),
      record: (accountId, from) => recordArrival(runtime.pool, accountId, from) }) : undefined;
    return createAuthHandler(action, { auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
      allowMutation: (ip, account) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret, account), claimPreview: claim,
      recordArrival: arrival })(request);
  };
}
