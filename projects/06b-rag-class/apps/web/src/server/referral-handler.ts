import { ClientAddressUnavailable, clientIp, recordBadgeRemovalIntent, recordReferralClick, type Pool } from '@n6b/db';
import { referralId } from '../lib/referral-cookie';
import { readSessionCookie } from './auth-handler';

export const BADGE_REMOVAL_MESSAGE = 'Скоро: ~990 ₽/мес, оставьте заявку';
export interface ReferralDeps {
  readonly servicePool: Pool;
  readonly publicBaseUrl: string;
  readonly visitorSecret: string;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } },
  { status, headers: { 'Cache-Control': 'no-store' } });

export function createReferralClickHandler(deps: ReferralDeps) {
  return async (request: Request, publicId: string): Promise<Response> => {
    const landing = new URL('/', deps.publicBaseUrl);
    try {
      const ref = referralId(publicId);
      let ip: string | null = null;
      try { ip = clientIp(request.headers); }
      catch (error) { if (!(error instanceof ClientAddressUnavailable)) throw error; }
      if (ref && await recordReferralClick(deps.servicePool, ref, deps.visitorSecret, ip, deps.now?.() ?? new Date())) {
        landing.searchParams.set('ref', ref);
        landing.searchParams.set('utm_source', 'badge');
      }
      return new Response(null, { status: 302, headers: { Location: landing.href, 'Cache-Control': 'no-store' } });
    } catch (error) {
      (deps.log ?? console.error)(`referral: ${(error as Error).name}`);
      return fail(503, 'referral_unavailable', 'Переход временно недоступен. Повторите позже');
    }
  };
}

export function createBadgeRemovalHandler(deps: Pick<ReferralDeps, 'servicePool' | 'publicBaseUrl' | 'now' | 'log'> & {
  readonly authenticate: (token: string) => Promise<string | null>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== new URL(deps.publicBaseUrl).origin) {
        return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      }
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      const recorded = await recordBadgeRemovalIntent(deps.servicePool, accountId, deps.now?.() ?? new Date());
      if (recorded === null) return fail(401, 'unauthorized', 'Войдите в кабинет');
      return Response.json({ data: { recorded, message: BADGE_REMOVAL_MESSAGE } },
        { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      (deps.log ?? console.error)(`badge-removal: ${(error as Error).name}`);
      return fail(503, 'intent_unavailable', 'Не удалось оставить заявку. Повторите позже');
    }
  };
}
