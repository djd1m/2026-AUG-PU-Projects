import { referralCookie } from '../lib/partner-referral';
import type { AuthService } from './auth';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { UploadError } from './upload-contract';
import { previewState, type ShortLinkService } from './short-link';

interface Dependencies {
  referralSecret: string;
  links: Pick<ShortLinkService, 'find' | 'recordView'>;
  auth: Pick<AuthService, 'authenticate'>;
  trustedProxyHops: number;
  allowRead: (ip: string, account?: string) => Promise<boolean>;
  preview: (key: string) => Promise<string | null>;
  clock?: () => Date;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);
function landing(title: string, preview: string | null, expired: boolean): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>КлипМейкер — ${escapeHtml(title)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f9f4;color:#21382a;font:1.125rem/1.6 system-ui,sans-serif}
nav,main{max-width:62.5rem;margin:auto;padding:1.5rem}nav a{color:inherit;text-decoration:none;font-weight:750}
main{display:grid;grid-template-columns:minmax(0,1fr);gap:3rem;align-items:center}
.preview{aspect-ratio:9/16;background:#21382a;color:white;border-radius:1.125rem;overflow:hidden;display:grid;place-items:center}
.preview img{width:100%;height:100%;object-fit:contain}.preview p{padding:1.5rem}h1{font-size:clamp(2rem,4vw,2.75rem);line-height:1.15;overflow-wrap:anywhere}
.cta{display:inline-block;padding:0.875rem 1.5rem;border-radius:0.625rem;background:#355e2a;color:white;text-decoration:none;font-weight:650}
@media(max-width:600px){main{grid-template-columns:1fr;gap:1.25rem;padding:1rem}.preview{max-height:23.75rem;width:100%;aspect-ratio:auto}.preview img{max-height:23.75rem}.preview p{min-height:7.5rem}nav{padding:1rem}}

h1,h2,h3,p,label,button,a,input,select,textarea{overflow-wrap:anywhere;hyphens:none}nav a,main>a:not([hidden]),footer a:not([hidden]){display:inline-flex;align-items:center;min-height:2.75rem}
main,nav{padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}nav{padding-top:max(1rem,env(safe-area-inset-top))}main{padding-bottom:max(1rem,env(safe-area-inset-bottom))}
button,.download,.cta{min-height:2.75rem;min-width:2.75rem}
video{max-height:min(70svh,31.25rem);object-fit:contain}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media(min-width:601px){main{grid-template-columns:minmax(0,1fr) minmax(0,21.25rem)}}
.cta{display:inline-flex;align-items:center}h1{margin-top:0}
</style></head><body><nav><a href="/">◧ КлипМейкер</a></nav><main>

<section><h1>${escapeHtml(title)}</h1><a class="cta" href="/">Сделать свои клипы</a><p>Этот фрагмент создан в КлипМейкере.</p>
<p>Превратите свой подкаст или вебинар в короткие вертикальные клипы с субтитрами — готовые к публикации.</p>
</section><section class="preview" aria-label="Превью клипа">${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer">`
    : `<p>${expired ? 'Срок хранения клипа истёк. Файл больше недоступен, но вы можете сделать свои клипы.' : 'Превью этого клипа пока недоступно. Попробуйте сделать свои клипы.'}</p>`}</section></main></body></html>`;
}
export function createShortLinkHandler(deps: Dependencies) {
  return async (request: Request, code: string): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; img-src https: http:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff' };
    try {
      const ip = clientIp(request.headers, deps.trustedProxyHops);
      const token = readSessionCookie(request);
      const session = token ? await deps.auth.authenticate(token) : null;
      if (!await deps.allowRead(ip, session?.account_id)) return new Response('Слишком много запросов. Повторите через минуту', { status: 429, headers });
      const link = await deps.links.find(code);
      const state = previewState(link, (deps.clock ?? (() => new Date()))());
      const preview = state === 'ready' ? await deps.preview(link.thumbnail_key!) : null;
      await deps.links.recordView(link, session?.account_id ?? null, ipPrefix(ip));
      const referral = referralCookie(request.headers.get('cookie') ?? '', link.partner_code, 'cookie', session?.account_id === link.account_id, deps.referralSecret);
      return new Response(landing(link.title, preview, state === 'expired'), { headers: { ...headers, ...(referral ? { 'Set-Cookie': referral } : {}), 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error) {
      if (error instanceof UploadError && error.status === 404) return new Response('Ссылка не найдена', { status: 404, headers });
      return new Response('Не удалось открыть страницу. Повторите позже', { status: 503, headers });
    }
  };
}
