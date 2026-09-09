export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = amount => Number.isSafeInteger(amount) ? new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(amount/100) : '—';
export const date = value => value ? new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)) : '—';
const labels={draft:'Черновик',approved:'Утверждён',stale:'Нужен пересчёт',sent:'Отправлено вручную',held:'На проверке',available:'Доступно',pending:'Ожидает',reserved:'Зарезервировано',applied:'Применено',unknown:'Требует сверки',failed:'Не выполнено',completed:'Готово',canceled:'Отменено',revoked:'Доступ отозван'};
export const badge = state => `<span class="badge state-${escape(state)}">${escape(labels[state]||state)}</span>`;
export const metric=(label,value,detail='')=>`<article class="metric-card"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(detail)}</small></article>`;
export const empty=text=>`<div class="empty"><span class="empty-icon">◇</span><p>${escape(text)}</p></div>`;
export function shell({variant,title,subtitle,role,nav,body}) {
  document.querySelector('#app').innerHTML=`<div class="demo-strip"><span><b>Лаборатория Круг</b> · вариант ${escape(variant)} · синтетические данные</span><button id="restart-demo">Новый сеанс</button></div><header class="topbar"><a class="brand" href="/" aria-label="Круг — начало"><span class="brand-mark">к</span>круг<span class="brand-dot">.</span></a><div class="top-note">Рекомендации, которым доверяют</div><span class="identity"><i></i>${escape(role)}</span></header><main class="layout"><aside class="sidebar"><span class="sidebar-label">ВАШЕ ПРОСТРАНСТВО</span><nav aria-label="Разделы">${nav}</nav><div class="sidebar-note"><span>↗</span><p>Один источник правды.<br>Для вас и вашего агента.</p></div></aside><section class="workspace"><div class="page-heading"><div><span class="eyebrow">КРУГ / ${escape(variant)}</span><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div><span class="live-label"><i></i>Демо работает с сервером</span></div><div id="feedback" role="status" aria-live="polite"></div><div id="scene">${body}</div><footer><b>Работает на Круг</b><span>Реальные деньги не списываются и не отправляются.</span></footer></section></main>`;
}
export function feedback(message,error=false) {
  const el=document.querySelector('#feedback');if(!el)return;
  el.className=error?'feedback error':'feedback success';el.textContent=message;el.setAttribute('role',error?'alert':'status');
}
export async function action(button, fn) {
  if(button.disabled)return;
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{await fn();}catch(error){feedback(error.message||'Нет связи с сервером. Повторите запрос.',true);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
}
export function bindActions(actions) {
  for(const [id,fn] of Object.entries(actions))document.getElementById(id)?.addEventListener('click',event=>action(event.currentTarget,fn));
}
export function download(name,content,type='text/csv;charset=utf-8') {
  const url=URL.createObjectURL(new Blob(['\ufeff',content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function copy(text) { await navigator.clipboard.writeText(text);feedback('Скопировано. Отправьте ссылку сами, когда будете готовы.'); }
export const field=(name,label,value,type='text')=>`<label class="field">${escape(label)}<input name="${escape(name)}" id="${escape(name)}" type="${type}" value="${escape(value)}"></label>`;
export function fatal(error) {
 document.querySelector('#app').innerHTML=`<main class="fatal"><h1>Не удалось открыть сеанс</h1><p role="alert">${escape(error.message)}</p><div class="actions"><button id="retry" class="primary">Повторить</button><button id="fresh" class="secondary">Новый демосеанс</button></div></main>`;
 document.querySelector('#retry').onclick=()=>location.reload();
 document.querySelector('#fresh').onclick=()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith('n3.fixture.'))sessionStorage.removeItem(key);location.replace(location.pathname);};
}
