// GET /r/{code} (фича partner-and-studio; FR-PARTNER-001, FR-GROWTH-002, AC-1). Ответ ОДИН для любого кода — 302 на
// лендинг без раскрытия, существует ли код; cookie реферала ставится только живому (существующему и незамороженному)
// коду и не затирает уже действующую (lib/partner-referral.ts). Публичный путь без входа: лимит чтений — дверь.
import { referralSetCookie } from '../lib/partner-referral';

export interface ReferralDependencies {
  publicOrigin: string;
  secret: string;
  isLiveCode: (code: string) => Promise<boolean>;
  log?: (line: string) => void;
}
export function createReferralHandler(deps: ReferralDependencies) {
  return async (request: Request, code: string): Promise<Response> => {
    const headers = new Headers({ Location: new URL('/', deps.publicOrigin).href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    try {
      const cookie = /^[A-Za-z0-9_-]{3,40}$/.test(code) && await deps.isLiveCode(code)
        ? referralSetCookie(request.headers.get('cookie'), code, deps.secret) : null;
      if (cookie) headers.append('Set-Cookie', cookie);
    } catch {
      // БД недоступна: переход не ломаем (посетитель попадает на лендинг), атрибуция по ссылке теряется — метрика, не доступ.
      (deps.log ?? console.error)('Реферал: код не проверен — переход без cookie');
    }
    return new Response(null, { status: 302, headers });
  };
}
