import { HttpError } from './boundaries.js';
export const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function verify(ok) { if (!ok) throw new HttpError(422,'payment_verification_failed'); }
export function minor(amount) {
  verify(amount?.currency==='RUB' && typeof amount.value==='string' && /^(0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(amount.value));
  const [a,b]=amount.value.split('.');const n=Number(a)*100+Number(b);
  verify(Number.isSafeInteger(n) && n>0);return n;
}
export function confirmationUrl(value, fixture=false, origin) {
  verify(typeof value==='string' && value.length<=2048);
  let url;try {url=new URL(value);}catch {verify(false);}
  verify(!url.username && !url.password && (url.protocol==='https:' ||
    (fixture && ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.origin===origin)));
  return url.href;
}
export function verifyPayment(p,intent,id,status) {
  verify(PROVIDER_ID.test(id) && p?.id===id && (!intent.provider_id || intent.provider_id===id));
  verify(p.recipient?.account_id===intent.merchant_id && minor(p.amount)===intent.amount_minor);
  verify(p.metadata?.intent_id===intent.id && p.metadata?.account_id===intent.account_id && p.metadata?.package==='ROOM20');
  if(status) verify(p.status===status && (status!=='succeeded' || p.paid===true));
  else verify(['pending','waiting_for_capture','succeeded','canceled'].includes(p.status));
}
export function verifyRefund(r,id,paymentId) {
  verify(r?.id===id && PROVIDER_ID.test(id) && r.payment_id===paymentId && r.status==='succeeded');
  const n=minor(r.amount);verify(n<=90000);return n;
}
// Fixed production endpoint. Tests inject fetch; runtime never accepts an API URL.
export function createProvider(config,{fetchImpl=globalThis.fetch}={}) {
  if(config.providerMode!=='live' || !/^[0-9]{1,64}$/.test(config.shopId??'') ||
    typeof config.providerSecret!=='string' || !config.providerSecret.trim() || config.providerSecret.length>512) throw new HttpError(503,'payments_unavailable');
  async function request(path,body,key) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
    try {
      const response=await fetchImpl('https://api.yookassa.ru/v3/'+path,{method:body?'POST':'GET',redirect:'error',signal:controller.signal,
        headers:{Authorization:'Basic '+Buffer.from(config.shopId+':'+config.providerSecret).toString('base64'),
          'Content-Type':'application/json',...(key?{'Idempotence-Key':key}:{})},...(body?{body}:{})});
      if(!response.ok || response.redirected) throw new Error('provider_unavailable');
      if(Number(response.headers.get('content-length'))>65536) {await response.body?.cancel();throw new Error('provider_oversize');}
      const chunks=[];let size=0;
      if(!response.body) throw new Error('provider_empty');
      const reader=response.body.getReader();
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>65536)throw new Error('provider_oversize');chunks.push(Buffer.from(value));}}
      finally {await reader.cancel().catch(()=>{});}
      return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
    } catch {throw new HttpError(503,'provider_unavailable');} finally {clearTimeout(timer);}
  }
  const id=value=>{verify(PROVIDER_ID.test(value));return value;};
  return {create:(body,key)=>request('payments',body,key),payment:value=>request('payments/'+id(value)),refund:value=>request('refunds/'+id(value))};
}
