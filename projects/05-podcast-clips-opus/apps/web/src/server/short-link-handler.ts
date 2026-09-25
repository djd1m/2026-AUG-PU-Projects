import { THEME_COLOR, themeFromCookie, type Theme } from '../lib/theme';
import { referralCookie } from '../lib/partner-referral';
import type { AuthService } from './auth';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { UploadError } from './upload-contract';
import { previewState, type ShortLinkService } from './short-link';
import { CTA_BUTTON_LABELS, ctaDisplayHost, readStoredCta, type CtaTarget } from '@clipmaker/shared/cta';

interface Dependencies {
  referralSecret: string;
  links: Pick<ShortLinkService, 'find' | 'recordView'>;
  auth: Pick<AuthService, 'authenticate'>;
  trustedProxyHops: number;
  allowRead: (ip: string, account?: string) => Promise<boolean>;
  preview: (key: string) => Promise<string | null>;
  clock?: () => Date;
}
// Colour tokens duplicated from apps/web/src/app/globals.css (values must match: tests/theme.test.ts).
const THEME_TOKENS = ':root{color-scheme:dark;--paper:#0e1311;--surface:#1a211d;--ink:#eef2ec;--green:#8fd4a4;--btn-bg:#dcefd9;--btn-fg:#0f1a14;--media-bg:#060807;--media-fg:#d5ddd6;--focus:#f2b552;}:root[data-theme=light]{color-scheme:light;--paper:#f7f8f3;--surface:#ffffff;--ink:#202a27;--green:#305d45;--btn-bg:#305d45;--btn-fg:#ffffff;--media-bg:#1d2822;--media-fg:#e2e7db;--focus:#9c5e0a;}';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);
// Призыв автора (ADR-017): обычная внешняя ссылка, НЕ редирект через наш домен (нет открытого редиректа);
// видимый домен и пометка «ссылка автора клипа» — против фишинга. Сервер по адресу не ходит.
// Класс .cta несёт ОСНОВНОЕ действие страницы (R9, FIRST_SCREEN_ACTIONS): кнопка призыва, если он задан,
// иначе «Сделать свои клипы». Второе действие — .secondary-link.
function actions(cta: CtaTarget): string {
  const own = (primary: boolean) => `<a class="${primary ? 'cta' : 'secondary-link'}" href="/">Сделать свои клипы</a>`;
  if (cta.kind === 'none') return own(true);
  return `<div class="author-cta"><a class="cta" href="${escapeHtml(cta.url)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(CTA_BUTTON_LABELS[cta.kind])}</a>
<p class="cta-host">Ссылка автора клипа · <span>${escapeHtml(ctaDisplayHost(cta.url))}</span></p></div>${own(false)}`;
}
function landing(title: string, preview: string | null, expired: boolean, theme: Theme, cta: CtaTarget = { kind: 'none', url: null }): string {
  return `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8"><meta name="color-scheme" content="${theme}"><meta name="theme-color" content="${THEME_COLOR[theme]}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>КлипМейкер — ${escapeHtml(title)}</title>
<style>${THEME_TOKENS}*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);font:1.125rem/1.6 system-ui,sans-serif}
nav,main{max-width:62.5rem;margin:auto;padding:1.5rem}nav a{color:inherit;text-decoration:none;font-weight:750}
main{display:grid;grid-template-columns:minmax(0,1fr);gap:3rem;align-items:center}
.preview{aspect-ratio:9/16;background:var(--media-bg);color:var(--media-fg);border-radius:1.125rem;overflow:hidden;display:grid;place-items:center}
.preview img{width:100%;height:100%;object-fit:contain}.preview p{padding:1.5rem}h1{font-size:clamp(2rem,4vw,2.75rem);line-height:1.15;overflow-wrap:anywhere}
.cta{display:inline-block;padding:0.875rem 1.5rem;border-radius:0.625rem;background:var(--btn-bg);color:var(--btn-fg);text-decoration:none;font-weight:650}:focus-visible{outline:0.1875rem solid var(--focus);outline-offset:0.25rem}
@media(max-width:600px){main{grid-template-columns:1fr;gap:1.25rem;padding:1rem}.preview{max-height:23.75rem;width:100%;aspect-ratio:auto}.preview img{max-height:23.75rem}.preview p{min-height:7.5rem}nav{padding:1rem}}

h1,h2,h3,p,label,button,a,input,select,textarea{overflow-wrap:anywhere;hyphens:none}nav a,main>a:not([hidden]),footer a:not([hidden]){display:inline-flex;align-items:center;min-height:2.75rem}
main,nav{padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}nav{padding-top:max(1rem,env(safe-area-inset-top))}main{padding-bottom:max(1rem,env(safe-area-inset-bottom))}
button,.download,.cta{min-height:2.75rem;min-width:2.75rem}
video{max-height:min(70svh,31.25rem);object-fit:contain}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media(min-width:601px){main{grid-template-columns:minmax(0,1fr) minmax(0,21.25rem)}}
.cta{display:inline-flex;align-items:center}h1{margin-top:0}
.author-cta{margin-bottom:0.75rem}.cta-host{margin:0.5rem 0 0;font-size:0.875rem;overflow-wrap:anywhere}.cta-host span{font-weight:650}
.secondary-link{display:inline-flex;align-items:center;min-height:2.75rem;min-width:2.75rem;padding:0.625rem 1.25rem;border:0.0625rem solid var(--green);border-radius:0.625rem;color:var(--green);text-decoration:none;font-weight:650}
</style></head><body><nav><a href="/">◧ КлипМейкер</a></nav><main>

<section><h1>${escapeHtml(title)}</h1>${actions(cta)}<p>Этот фрагмент создан в КлипМейкере.</p>
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
      return new Response(landing(link.title, preview, state === 'expired', themeFromCookie(request.headers.get('cookie') ?? undefined), readStoredCta(link.cta_kind, link.cta_url)), { headers: { ...headers, ...(referral ? { 'Set-Cookie': referral } : {}), 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error) {
      if (error instanceof UploadError && error.status === 404) return new Response('Ссылка не найдена', { status: 404, headers });
      return new Response('Не удалось открыть страницу. Повторите позже', { status: 503, headers });
    }
  };
}
