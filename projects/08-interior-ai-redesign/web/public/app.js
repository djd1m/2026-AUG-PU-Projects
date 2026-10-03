import {createIntent,createScope} from './ui-state.js';
import {installActions} from './ui-actions.js';
const $=id=>document.getElementById(id), scope=createScope();
const status=text=>{$('status').textContent=text;};
const messages={authentication_required:'Войдите, чтобы открыть свои комнаты.',invalid_credentials:'Проверьте почту и пароль.',registration_unavailable:'Адрес уже используется. Попробуйте войти.',invalid_image:'Нужен корректный JPEG, PNG или WebP.',body_too_large:'Файл или запрос слишком большой.',image_too_large:'Фото превышает 10 МиБ или 20 мегапикселей.',insufficient_credit:'Недостаточно кредитов. Фото сохранено; можно приобрести пакет.',budget_exhausted:'Дневной бюджет попыток исчерпан. Попробуйте позже.',billing_hold:'Аккаунт ограничен после проверки оплаты. Новая генерация недоступна.',queue_expired:'Истекло время ожидания очереди.',hard_deadline:'Истекло время выполнения.',payments_unavailable:'Оплата сейчас недоступна.',origin_denied:'Адрес страницы не совпадает с адресом сервиса.',not_found:'Работа удалена или недоступна.',idempotency_conflict:'Запрос не совпадает с сохранённой попыткой.',tracking_consent_required:'Сначала явно разрешите tracking.',invalid_partner:'Партнёрский код недоступен.',rate_limited:'Слишком много запросов. Попробуйте позже.',service_unavailable:'Сервис временно недоступен.'};
let account=null,uploads=[],style='warm',job=null,jobIntent=null,paymentIntent=null,timer=null,pollVersion=0,next=null;
async function api(path,options={}) {
  return scope.run(async signal=>{
    let response;
    try {response=await fetch(path,{credentials:'same-origin',...options,signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});}
    catch(e) {if(e.name==='AbortError')throw new Error('stale_account');throw new Error('Нет связи. Состояние неизвестно; повторите тот же запрос или обновите статус.');}
    let data;try {data=await response.json();}catch {throw new Error('Ответ сервера не прочитан. Состояние неизвестно; повторите запрос с сохранённым ключом.');}
    if(!response.ok) {const e=new Error(messages[data.error]??`Не удалось выполнить запрос (${data.error??response.status}).`);e.code=data.error;throw e;}
    return data;
  });
}
const post=(path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function stopPoll() {clearTimeout(timer);timer=null;pollVersion++;}
function clearResult() {
  stopPoll();job=null;$('result').hidden=true;$('comparison').hidden=true;
  for(const id of ['before','after'])$(id).removeAttribute('src');actions.clear();
}
function showAccount(value) {
  scope.reset();clearResult();account=value;uploads=[];
  $('jobs').replaceChildren();$('upload-choice').replaceChildren();$('source-preview').removeAttribute('src');$('source-preview').hidden=true;$('file').value='';
  $('auth').hidden=!!value;$('workspace').hidden=!value;$('logout').hidden=!value;
  $('password').value='';$('account-info').textContent='';
  jobIntent=value?createIntent(sessionStorage,`roomkind:job:${value.id}`):null;
  paymentIntent=value?createIntent(sessionStorage,`roomkind:payment:${value.id}`):null;
  actions.reset();paintAccount();
}
function paintAccount() {
  $('account-info').textContent=account?`${account.email} · Кредитов: ${account.credits} · ${account.billing_hold?'Ограничение оплаты':'Аккаунт активен'}`:'';
  $('generate').disabled=!account||!$('upload-choice').value||account.billing_hold;
}
async function balance() {
  const token=scope.current();const value=(await api('/api/me')).account;
  if(!scope.valid(token))return;
  if(account&&value.id!==account.id) {showAccount(value);await load();return;}
  account=value;paintAccount();
}
function source() {
  const id=$('upload-choice').value;$('source-preview').hidden=!id;$('delete-upload').disabled=!id;
  if(id)$('source-preview').src=`/api/uploads/${id}`;else $('source-preview').removeAttribute('src');paintAccount();
}
async function loadUploads(selected) {
  const data=await api('/api/uploads');uploads=data.uploads;const old=selected??$('upload-choice').value;
  $('upload-choice').replaceChildren(new Option('Выберите фото',''));
  for(const u of uploads)$('upload-choice').append(new Option(`${u.width} × ${u.height} · ${u.id.slice(0,8)}`,u.id));
  $('upload-choice').value=uploads.some(u=>u.id===old)?old:uploads[0]?.id??'';source();
}
async function gallery(before) {
  const data=await api('/api/jobs?limit=50'+(before?'&before='+encodeURIComponent(before):''));
  if(!before)$('jobs').replaceChildren();$('empty').hidden=data.jobs.length>0||$('jobs').children.length>0;
  next=data.next;$('next').hidden=!next;
  for(const j of data.jobs) {
    const li=document.createElement('li'),p=document.createElement('p'),button=document.createElement('button');
    p.textContent=`${j.style} · ${j.status} · ${j.mode==='fixture'?'DEMO / НЕ ПРОВЕРЕНО':j.quality??'Качество не проверено'}`;
    if(j.status==='succeeded'&&j.quality!=='rejected'){const img=document.createElement('img');img.src=`/api/jobs/${j.job_id}/result`;img.alt='AI редизайн из вашей приватной галереи';img.loading='lazy';li.append(img);}
    button.textContent='Открыть работу';button.onclick=()=>guard(()=>openJob(j.job_id));li.append(p,button);$('jobs').append(li);
  }
}
async function renderJob(current) {
  job=current;$('result').hidden=false;$('comparison').hidden=current.status!=='succeeded'||current.quality==='rejected';
  $('job-status').textContent=current.status==='failed'?`Не удалось: ${messages[current.failure_reason]??current.failure_reason}. Исходное фото сохранено. Выберите стиль и создайте новую попытку.`:`${current.status==='queued'?'Ожидаем очередь':current.status==='running'?'Генерация выполняется':'Работа завершена'} · попыток: ${current.attempts}`;
  if(current.status==='succeeded'&&current.quality!=='rejected') {
    $('before').src=`/api/uploads/${current.upload_id}`;$('after').src=`/api/jobs/${current.job_id}/result`;
    $('quality-label').textContent=current.mode==='fixture'?'DEMO / НЕ ПРОВЕРЕНО · демонстрация программного сценария, геометрия не подтверждена':`AI редизайн · качество: ${current.quality}. Проверьте окна, двери и стены.`;
    await actions.publication(current);
  }
}
async function openJob(id) {
  clearResult();const version=pollVersion;
  const current=(await api(`/api/jobs/${id}`)).job;
  if(version!==pollVersion)return;
  await renderJob(current);
  if(version!==pollVersion)return;
  if(['queued','running'].includes(job.status))schedule(id,version);
}
function schedule(id,version) {
  timer=setTimeout(async()=>{
    try {
      const value=(await api(`/api/jobs/${id}`)).job;
      if(version!==pollVersion||!account||job?.job_id!==id)return;
      await renderJob(value);
      if(['queued','running'].includes(value.status))schedule(id,version);else {await balance();await gallery();}
    }catch(e){if(e.message!=='stale_account'&&version===pollVersion)$('job-status').textContent='Статус неизвестен. Обновите статус; новая генерация не создавалась.';}
  },2000);
}
async function load() {
  await loadUploads();await gallery();await actions.load();
  const prior=jobIntent.get();
  if(prior?.body&&uploads.some(u=>u.id===prior.body.upload_id)) {
    $('upload-choice').value=prior.body.upload_id;style=prior.body.style;styleButtons();source();
    if(prior.id)await openJob(prior.id);else status('Ответ прошлой генерации неизвестен. «Создать редизайн» повторит её с тем же ключом.');
  }
}
function styleButtons(){for(const b of $('styles').children)b.setAttribute('aria-pressed',String(b.dataset.style===style));}
async function guard(work) {try {await work();}catch(e){if(e.message==='stale_account')return;if(e.code==='authentication_required')showAccount(null);status(e.message);}}
const actions=installActions({$,api,post,scope,status,balance,guard,getAccount:()=>account,getJob:()=>job,getPaymentIntent:()=>paymentIntent});
$('auth-form').onsubmit=event=>{
  event.preventDefault();const action=event.submitter?.value??'login';const form=event.currentTarget;
  guard(async()=>{form.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {await post(`/api/${action}`,{email:$('email').value,password:$('password').value});showAccount((await api('/api/me')).account);await load();status('Ваше личное пространство готово.');}
    finally {form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
};
$('logout').onclick=()=>{const old=account;showAccount(null);guard(async()=>{await post('/api/logout',{});status('Вы вышли.');});if(old){jobIntent=null;paymentIntent=null;}};
$('upload-form').onsubmit=event=>{event.preventDefault();guard(async()=>{
  const file=$('file').files[0];if(!file)return;if(file.size>10485760)throw new Error(messages.image_too_large);
  const u=(await api('/api/uploads',{method:'POST',headers:{'Content-Type':file.type},body:file})).upload;
  jobIntent.clear();$('file').value='';await loadUploads(u.id);status('Фото сохранено приватно. Выберите настроение.');
});};
$('upload-choice').onchange=()=>{jobIntent.clear();source();};
for(const b of $('styles').children)b.onclick=()=>{if(style!==b.dataset.style){style=b.dataset.style;jobIntent.clear();}styleButtons();};
$('generate').onclick=()=>guard(async()=>{
  $('generate').disabled=true;
  try {const intent=jobIntent;if(intent.get()?.id && job && ['failed','succeeded'].includes(job.status))intent.clear();const body=intent.select({upload_id:$('upload-choice').value,style});const value=await post('/api/jobs',body);intent.resolved(value.job_id);await openJob(value.job_id);await balance();await gallery();}
  finally {paintAccount();}
});
$('resume').onclick=()=>guard(()=>openJob(job.job_id));
$('refresh').onclick=()=>guard(async()=>{await balance();await gallery();});$('next').onclick=()=>guard(()=>gallery(next));
$('delete-job').onclick=()=>guard(async()=>{const id=job.job_id;scope.reset();clearResult();$('jobs').replaceChildren();await api(`/api/jobs/${id}`,{method:'DELETE'});jobIntent.clear();await loadUploads();await balance();await gallery();});
$('delete-upload').onclick=()=>guard(async()=>{const id=$('upload-choice').value;scope.reset();clearResult();$('jobs').replaceChildren();$('source-preview').removeAttribute('src');await api(`/api/uploads/${id}`,{method:'DELETE'});jobIntent.clear();await loadUploads();await balance();await gallery();});
$('split').oninput=()=>{const v=$('split').value;$('compare').style.setProperty('--split',v+'%');$('split-state').textContent=v+'% исходного фото';$('split').setAttribute('aria-valuetext',v+'% исходного фото');};
guard(async()=>{try {showAccount((await api('/api/me')).account);await load();status('Фото приватны. Согласие на публикацию и tracking — ваш отдельный выбор.');}catch(e){if(e.code==='authentication_required'){showAccount(null);status(messages.authentication_required);}else throw e;}});
