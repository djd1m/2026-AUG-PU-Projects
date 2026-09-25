import { pluralRu } from '../lib/plural-ru';
import { randomBytes } from 'node:crypto';
import { referralCookie } from '../lib/partner-referral';
import type { AuthService } from './auth';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { UploadError } from './upload-contract';
import type { GuestPackService } from './guest-pack';

interface Dependencies {
  referralSecret: string;
  guests: Pick<GuestPackService, 'find' | 'recordOpen'>; auth: Pick<AuthService, 'authenticate'>;
  trustedProxyHops: number; allowRead: (ip: string, account?: string) => Promise<boolean>;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);
function landing(pack: Awaited<ReturnType<GuestPackService['find']>>, nonce: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><title>Ваши клипы — КлипМейкер</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f9f4;color:#21382a;font:1.125rem/1.6 system-ui,sans-serif}
main{max-width:65.625rem;margin:auto;padding:1.5rem}h1{font-size:clamp(2rem,4vw,2.625rem);line-height:1.2;overflow-wrap:anywhere}
.clips{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16.25rem),1fr));gap:1.5rem}
article{min-width:0;background:white;padding:1rem;border-radius:1rem}h2{overflow-wrap:anywhere;font-size:1.375rem}
video{width:100%;max-height:31.25rem;aspect-ratio:9/16;background:#21382a;border-radius:0.625rem}
a{color:#355e2a}button,.download{display:inline-block;padding:0.75rem 1.125rem;border:0;border-radius:0.5rem;background:#355e2a;color:white;font:inherit}
button{cursor:pointer;margin-bottom:1.25rem}button:disabled{opacity:.6}footer{margin-top:2rem}small{display:block}
@media(max-width:600px){main{padding:1rem}.clips{grid-template-columns:1fr}}
h1,h2,h3,p,label,button,a,input,select,textarea{overflow-wrap:anywhere;hyphens:none}nav a,main>a:not([hidden]),footer a:not([hidden]){display:inline-flex;align-items:center;min-height:2.75rem}
main,nav{padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}nav{padding-top:max(1rem,env(safe-area-inset-top))}main{padding-bottom:max(1rem,env(safe-area-inset-bottom))}
button,.download,.cta{min-height:2.75rem;min-width:2.75rem}
video{max-height:min(70svh,31.25rem);object-fit:contain}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style></head><body><main>
<a href="/">КлипМейкер</a><h1>${escapeHtml(pack.guest_name)}, ${pluralRu(pack.clips.length, ['ваш', 'ваши', 'ваши'])} ${pack.clips.length} ${pluralRu(pack.clips.length, ['момент', 'момента', 'моментов'])} из выпуска</h1>
<p>Ведущий отметил эти клипы для вас. Скачайте и опубликуйте их у себя.</p>
<p>Ссылка действует до ${escapeHtml(pack.expires_at!.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }))}. Файлы могут стать недоступны раньше по сроку хранения.</p>
<button id="download-all" ${pack.clips.some(c => c.available) ? '' : 'disabled'}>Скачать все</button><p id="download-status" role="status"></p>
<div class="clips">${pack.clips.map(clip => {
    const base = `/api/clips/${clip.clip_id}`, query = `g=${encodeURIComponent(pack.code)}`;
    return `<article><h2>${escapeHtml(clip.title)}</h2>${clip.available
      ? `<video controls playsinline preload="none" src="${base}/file?${query}" poster="${base}/thumbnail?${query}"></video>
<a class="download" href="${base}/file?${query}&amp;download=1" download>Скачать</a>`
      : '<p>Срок хранения клипа истёк или файл пока недоступен.</p>'}</article>`;
  }).join('')}</div><footer><a href="/">Сделать свои клипы</a>
<section aria-label="Интерес к тарифу"><p>Сейчас доступен только бесплатный тариф.</p>
<p>Нужны больше минут или клипы без метки? Отметьте интерес — это поможет нам оценить спрос.</p>
<button id="pro-interest">Нужен тариф побольше</button><p id="interest-status" role="status"></p>
<a id="interest-login" href="/" hidden>Войти в аккаунт</a></section>
<p>Чтобы отозвать публикацию, свяжитесь с ведущим, который прислал эту ссылку: он может закрыть доступ к пакету.</p></footer>
<script nonce="${nonce}">document.getElementById('pro-interest').addEventListener('click',async function(){
this.disabled=true;const status=document.getElementById('interest-status');status.textContent='Записываем…';
try{const response=await fetch('/api/trpc/interest.create',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_screen:'guest_page'})});
if(response.status===401){document.getElementById('interest-login').hidden=false;throw new Error('Войдите в аккаунт, затем вернитесь сюда и отметьте интерес.');}
if(!response.ok)throw new Error('Не удалось записать интерес. Повторите позже');
status.textContent='Спасибо, ваш интерес записан.';
}catch(error){status.textContent=error.message;this.disabled=false;}});
document.getElementById('download-all').addEventListener('click',async function(){
this.disabled=true;const status=document.getElementById('download-status');let count=0;
try{for(const link of document.querySelectorAll('a.download')){status.textContent='Скачиваем клип '+(count+1);
const response=await fetch(link.href,{cache:'no-store'});if(!response.ok)throw new Error('Файл недоступен');
const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='clip-'+(++count)+'.mp4';
document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
status.textContent='Скачивание начато. Если браузер заблокировал несколько файлов, используйте кнопки на клипах.';
}catch{status.textContent='Не удалось скачать все файлы. Попробуйте кнопки на отдельных клипах.';}finally{this.disabled=false;}});</script>
</main></body></html>`;
}
export function createGuestPageHandler(deps: Dependencies) {
  return async (request: Request, code: string): Promise<Response> => {
    const nonce = randomBytes(18).toString('base64');
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff' };
    try {
      const ip = clientIp(request.headers, deps.trustedProxyHops);
      const token = readSessionCookie(request), session = token ? await deps.auth.authenticate(token) : null;
      if (!await deps.allowRead(ip, session?.account_id)) return new Response('Слишком много запросов. Повторите через минуту', { status: 429, headers });
      const pack = await deps.guests.find(code);
      await deps.guests.recordOpen(pack, session?.account_id ?? null, ipPrefix(ip));
      const referral = referralCookie(request.headers.get('cookie') ?? '', pack.partner_code, 'guest_link', session?.account_id === pack.account_id, deps.referralSecret);
      return new Response(landing(pack, nonce), { headers: { ...headers, ...(referral ? { 'Set-Cookie': referral } : {}), 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; img-src 'self'; media-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` } });
    } catch (error) {
      if (error instanceof UploadError && error.status === 404) return new Response('Ссылка не найдена', { status: 404, headers });
      return new Response('Не удалось открыть страницу. Повторите позже', { status: 503, headers });
    }
  };
}
