import {nativeOutcome,safeConfirmation} from './ui-state.js';
export function installActions({$,api,post,scope,status,balance,guard,getAccount,getJob,getPaymentIntent}) {
  let prepared=null,shareVersion=0,paymentTimer=null,paymentVersion=0,config=null,eligible=false,terminalPayment=false;
  function clear() {
    shareVersion++;prepared=null;eligible=false;
    $('prepare-share').disabled=false;$('native-share').disabled=false;
    for(const id of ['native-share','download','public-link','revoke'])$(id).hidden=true;
    $('publish-consent').checked=false;$('publish').disabled=true;
    $('context').value='';$('description').value='';$('share-status').textContent='';$('publication-status').textContent='';
  }
  function reset() {
    clear();clearTimeout(paymentTimer);paymentVersion++;config=null;terminalPayment=false;
    $('checkout').hidden=true;$('checkout').removeAttribute('href');$('payment-resume').hidden=true;$('buy').disabled=true;
    $('payment-status').textContent='';$('tracking-consent').checked=false;$('partner-code').value='';$('attribution-status').textContent='';
  }
  function attribution(value) {
    $('tracking-consent').checked=value.tracking_opt_in;
    $('attribution-status').textContent=`Tracking: ${value.tracking_opt_in?'разрешён':'отклонён'} · код: ${value.partner_code??'нет'} · источник: ${value.source??'нет'}`;
  }
  async function load() {
    attribution(await post('/api/attribution/state',{}));
    const candidate=new URL(location.href).searchParams.get('partner_code');
    $('partner-candidate').textContent=candidate?`Код из ссылки (не сохранён): ${candidate}`:'Код из ссылки отсутствует.';
    config=await api('/api/payments/config');
    $('package-details').textContent=`${config.package} · ${config.credits} кредитов · ${config.amount_minor/100} ${config.currency}`;
    $('payment-mode').textContent=config.provider_mode==='fixture'?'ЛОКАЛЬНАЯ ДЕМОНСТРАЦИЯ ОПЛАТЫ · реального списания нет':config.provider_mode==='disabled'?'Оплата недоступна: провайдер отключён.':'Оплата на защищённой странице провайдера.';
    $('buy').disabled=config.provider_mode==='disabled';
    if(getPaymentIntent()?.get()?.id)await payment(getPaymentIntent().get().id);
    else if(getPaymentIntent()?.get())$('payment-status').textContent='Ответ создания оплаты неизвестен. Повторите получение пакета: ключ сохранён.';
  }
  async function payment(id) {
    clearTimeout(paymentTimer);const version=++paymentVersion;
    $('payment-status').textContent='Проверяем оплату. До ответа сервера состояние неизвестно.';
    const value=(await api(`/api/payments/${id}`)).payment;terminalPayment=['succeeded','canceled','review'].includes(value.status);
    $('payment-resume').hidden=false;$('payment-status').textContent=`Оплата: ${value.status} · ${value.provider_mode==='fixture'?'ЛОКАЛЬНАЯ DEMO':'ROOM20'}`;
    const url=safeConfirmation(value.confirmation_url,value.provider_mode,location.origin);
    $('checkout').hidden=!url;if(url)$('checkout').href=url;else $('checkout').removeAttribute('href');
    await balance();
    if(['created','pending'].includes(value.status)&&getAccount()&&version===paymentVersion)paymentTimer=setTimeout(()=>guard(()=>payment(id)),2500);
  }
  $('buy').onclick=()=>guard(async()=>{
    $('buy').disabled=true;
    try {const intent=getPaymentIntent();if(terminalPayment)intent.clear();const body=intent.select({package:'ROOM20'});const result=await post('/api/payments',body);intent.resolved(result.payment.payment_id);await payment(result.payment.payment_id);}
    finally {if(getAccount())$('buy').disabled=config?.provider_mode==='disabled';}
  });
  $('payment-resume').onclick=()=>guard(()=>payment(getPaymentIntent().get().id));
  $('manual-code').onclick=()=>guard(async()=>{attribution(await post('/api/attribution',{action:'manual',partner_code:$('partner-code').value.trim()}));});
  $('accept-tracking').onclick=()=>guard(async()=>{
    if(!$('tracking-consent').checked)throw new Error('Отметьте отдельное согласие на tracking cookie.');
    const code=$('partner-code').value.trim()||new URL(location.href).searchParams.get('partner_code');
    attribution(await post('/api/attribution',{action:'accept',...(code?{partner_code:code}:{})}));
  });
  for(const [id,action] of [['deny-tracking','deny'],['clear-tracking','clear']])$(id).onclick=()=>guard(async()=>{attribution(await post('/api/attribution',{action}));});
  async function prepare(mode) {
    const job=getJob(),version=shareVersion,token=scope.current(),key=crypto.randomUUID();
    const attempt=await post(`/api/jobs/${job.job_id}/share-attempt`,{event_key:key,mode});
    const blob=await scope.run(async signal=>{
      const response=await fetch(attempt.artifact,{credentials:'same-origin',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw new Error('Сравнение недоступно. Обновите работу.');return response.blob();
    });
    if(version!==shareVersion||!scope.valid(token)||getJob()?.job_id!==job.job_id)throw new Error('stale_account');
    return {id:job.job_id,key,mode,file:new File([blob],'roomkind.webp',{type:'image/webp'})};
  }
  $('prepare-share').onclick=()=>guard(async()=>{
    $('prepare-share').disabled=true;$('share-status').textContent='Готовим приватное сравнение…';
    try {
      let artifact=await prepare('native');
      if(!navigator.share||!navigator.canShare?.({files:[artifact.file]})) {
        await post(`/api/jobs/${artifact.id}/share-outcome`,{event_key:artifact.key,outcome:'unavailable'});
        artifact=await prepare('download');
      }
      prepared=artifact;$('native-share').disabled=false;$('native-share').hidden=artifact.mode!=='native';$('download').hidden=false;
      $('share-status').textContent='Файл готов. Следующее нажатие поделится или скачает сравнение.';
    } finally {if(getAccount())$('prepare-share').disabled=false;}
  });
  $('native-share').onclick=()=>{
    const item=prepared,token=scope.current(),version=shareVersion;if(!item)return;
    $('native-share').disabled=true;
    // Called immediately in this second user gesture, before any network await.
    const result=nativeOutcome(item.file,navigator);
    guard(async()=>{const outcome=await result;if(!scope.valid(token)||version!==shareVersion)return;
      await post(`/api/jobs/${item.id}/share-outcome`,{event_key:item.key,outcome});
      $('share-status').textContent={resolved:'Браузер завершил передачу файла. Это не подтверждает публикацию в соцсети.',abort:'Передача отменена. Публикация не зафиксирована.',error:'Не удалось передать файл. Можно скачать сравнение.',unavailable:'Передача файлов недоступна. Можно скачать сравнение.'}[outcome];
      $('native-share').hidden=true;
    });
  };
  $('download').onclick=()=>guard(async()=>{
    if(!prepared)return;
    // A download always has its own mode/key; never claims native completion.
    const item=prepared.mode==='download'?prepared:await prepare('download');
    const url=URL.createObjectURL(item.file),a=document.createElement('a');
    try {a.href=url;a.download='roomkind.webp';document.body.append(a);a.click();$('share-status').textContent='Файл передан браузеру для скачивания. Социальная публикация не подтверждается.';}
    finally {a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  });
  async function publication(job) {
    eligible=job.mode==='controlnet'&&job.quality==='accepted'&&!getAccount()?.billing_hold;
    $('publication-reason').textContent=eligible?'Отдельное согласие относится только к этой работе. Сервер повторно проверит право публикации.':'Публикация недоступна: нужен проверенный реальный результат и активный аккаунт. DEMO нельзя публиковать.';
    $('publish-consent').disabled=!eligible;$('publish').disabled=!eligible||!$('publish-consent').checked;
    const value=await api(`/api/jobs/${job.job_id}/publication`);
    if(getJob()?.job_id!==job.job_id)return;
    $('publication-status').textContent=value.published?(value.available?'Опубликовано.':'Согласие сохранено, пример сейчас недоступен.'):'Приватно. Согласие не дано.';
    $('revoke').hidden=!value.published;$('public-link').hidden=!value.available;
    if(value.available)$('public-link').href=value.publication.page;else $('public-link').removeAttribute('href');
  }
  $('publish-consent').onchange=()=>{$('publish').disabled=!eligible||!$('publish-consent').checked;};
  $('publication-form').onsubmit=event=>{event.preventDefault();guard(async()=>{
    if(!$('publish-consent').checked||!eligible)throw new Error('Нужно отдельное согласие и проверенный реальный результат.');
    const job=getJob();await post(`/api/jobs/${job.job_id}/publication`,{publish:true,style:job.style,source_context:$('context').value,description:$('description').value});await publication(job);
  });};
  $('revoke').onclick=()=>guard(async()=>{const job=getJob();await api(`/api/jobs/${job.job_id}/publication`,{method:'DELETE'});$('publish-consent').checked=false;await publication(job);status('Публикация отозвана. Старый публичный адрес недоступен.');});
  return {clear,reset,load,publication};
}
