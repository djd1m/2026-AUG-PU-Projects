import type { AuthService } from './auth';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { UploadError } from './upload-contract';
import { previewState, type ShortLinkService } from './short-link';

interface Dependencies {
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
<meta name="viewport" content="width=device-width, initial-scale=1"><title>КлипМейкер — ${escapeHtml(title)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f9f4;color:#21382a;font:18px/1.6 system-ui,sans-serif}
nav,main{max-width:1000px;margin:auto;padding:24px}nav a{color:inherit;text-decoration:none;font-weight:750}
main{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:48px;align-items:center}
.preview{aspect-ratio:9/16;background:#21382a;color:white;border-radius:18px;overflow:hidden;display:grid;place-items:center}
.preview img{width:100%;height:100%;object-fit:contain}.preview p{padding:24px}h1{font-size:clamp(28px,5vw,44px);line-height:1.15;overflow-wrap:anywhere}
.cta{display:inline-block;padding:14px 24px;border-radius:10px;background:#355e2a;color:white;text-decoration:none;font-weight:650}
@media(max-width:600px){main{grid-template-columns:1fr;gap:20px;padding:16px}.preview{max-height:380px;width:100%;aspect-ratio:auto}.preview img{max-height:380px}.preview p{min-height:120px}nav{padding:16px}}
</style></head><body><nav><a href="/">◧ КлипМейкер</a></nav><main>
<section class="preview" aria-label="Превью клипа">${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer">`
    : `<p>${expired ? 'Срок хранения клипа истёк. Файл больше недоступен, но вы можете сделать свои клипы.' : 'Превью этого клипа пока недоступно. Попробуйте сделать свои клипы.'}</p>`}</section>
<section><h1>${escapeHtml(title)}</h1><p>Этот фрагмент создан в КлипМейкере.</p>
<p>Превратите свой подкаст или вебинар в короткие вертикальные клипы с субтитрами — готовые к публикации.</p>
<a class="cta" href="/">Сделать свои клипы</a></section></main></body></html>`;
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
      return new Response(landing(link.title, preview, state === 'expired'), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error) {
      if (error instanceof UploadError && error.status === 404) return new Response('Ссылка не найдена', { status: 404, headers });
      return new Response('Не удалось открыть страницу. Повторите позже', { status: 503, headers });
    }
  };
}
