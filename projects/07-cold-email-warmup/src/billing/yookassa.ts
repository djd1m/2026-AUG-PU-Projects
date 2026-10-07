import { HttpError } from '../errors.js';
import { formatMinor,parseProviderTimestamp,validateConfirmationUrl,type CanonicalProvider,type CreateRequest,type LiveBinding,type VerifiedPayment,type VerifiedRefund } from './provider.js';
// Adapted: N3 shared/payments/yookassa.mjs bounded streaming JSON and exact money;
// N6 apps/web/src/server/payments/yookassa.ts typed adapter boundary, not body buffering.
const API='https://api.yookassa.ru/v3',LIMIT=64*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RecordValue=Record<string,unknown>;
function record(v:unknown):v is RecordValue {return !!v && typeof v==='object' && !Array.isArray(v);}
function verify(condition:unknown):asserts condition {if(!condition) throw new HttpError(409,'payment_mismatch');}
function id(value:unknown):string {verify(typeof value==='string' && UUID.test(value));return value;}
function amount(value:unknown):number {
 verify(record(value) && value.currency==='RUB' && typeof value.value==='string' && /^(?:0|[1-9]\d*)\.\d{2}$/.test(value.value));
 const [major,minor]=value.value.split('.'),n=Number(major)*100+Number(minor);
 verify(Number.isSafeInteger(n) && n>0 && n<=2147483647);return n;
}
async function readBoundedJson(response:Response):Promise<RecordValue> {
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')) throw new HttpError(503,'provider_non_json');
 const declared=response.headers.get('content-length');
 if(declared!==null && (!/^\d+$/.test(declared) || Number(declared)>LIMIT)) {await response.body?.cancel();throw new HttpError(503,'provider_body_too_large');}
 if(!response.body) throw new HttpError(503,'provider_invalid_json');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try {
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>LIMIT){await reader.cancel();throw new HttpError(503,'provider_body_too_large');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
 } catch(e){if(e instanceof HttpError)throw e;throw new HttpError(503,'provider_invalid_json');}
 finally {reader.releaseLock();}
 let parsed:unknown;try {parsed=JSON.parse(text);} catch {throw new HttpError(503,'provider_invalid_json');}
 if(!record(parsed)) throw new HttpError(503,'provider_invalid_json');return parsed;
}
export interface YooKassaOptions {shopId:string;secretKey:string;fetchImpl?:typeof fetch}
export class YooKassaProvider implements CanonicalProvider {
 private readonly authorization:string;
 private readonly fetchImpl:typeof fetch;
 private readonly shopId:string;
 constructor(options:YooKassaOptions) {
  if(!/^[0-9]{1,64}$/.test(options.shopId) || typeof options.secretKey!=='string' || !options.secretKey || options.secretKey.length>512 || /[\u0000-\u001f\u007f]/.test(options.secretKey)) throw new HttpError(503,'invalid_provider_config');
  this.shopId=options.shopId;this.authorization=`Basic ${Buffer.from(`${options.shopId}:${options.secretKey}`).toString('base64')}`;this.fetchImpl=options.fetchImpl??fetch;
 }
 private expected(b?:Readonly<LiveBinding>):Readonly<LiveBinding> {
  verify(b && b.provider==='yookassa' && b.merchant===this.shopId && b.mode==='live' && b.currency==='RUB' && b.plan==='team');
  id(b.intent);formatMinor(b.amountMinor);return b;
 }
 private async request(path:string,body?:Readonly<CreateRequest>,key?:string,createExpiresAt?:number) {
  let response:Response;
  const init:RequestInit={method:body?'POST':'GET',headers:{accept:'application/json',authorization:this.authorization,...(body?{'content-type':'application/json','idempotence-key':key!}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(5000)};
  // After synchronous body/header preparation, guard the actual POST invocation.
  // No await is allowed between this persisted deadline check and fetch.
  if(body && (!Number.isFinite(createExpiresAt) || Date.now()>=createExpiresAt!)) throw new HttpError(409,'checkout_reconciliation_required');
  try {response=await this.fetchImpl(API+path,init);}
  catch {throw new HttpError(503,'provider_unavailable');}
  if(!response || response.redirected || !response.ok){await response?.body?.cancel();throw new HttpError(503,'provider_unavailable');}
  return readBoundedJson(response);
 }
 private payment(raw:RecordValue,b:Readonly<LiveBinding>,expectedId?:string):VerifiedPayment {
  const paymentId=id(raw.id);verify(!expectedId || paymentId===expectedId);
  verify(record(raw.recipient) && raw.recipient.account_id===b.merchant && raw.test===false && record(raw.metadata) && raw.metadata.order_id===b.intent && amount(raw.amount)===b.amountMinor);
  verify(['pending','waiting_for_capture','succeeded','canceled'].includes(String(raw.status)) && typeof raw.paid==='boolean');
  const paidAt=raw.captured_at===undefined?null:raw.captured_at; if(paidAt!==null)parseProviderTimestamp(paidAt);
  if(raw.status==='succeeded')verify(raw.paid===true && typeof paidAt==='string');
  const confirmation=record(raw.confirmation)?raw.confirmation:null;
  const confirmationUrl=confirmation?.confirmation_url===undefined?null:validateConfirmationUrl(confirmation.confirmation_url);
  return Object.freeze({...b,id:paymentId,status:raw.status==='waiting_for_capture'?'pending':raw.status as VerifiedPayment['status'],paid:raw.paid,paidAt:paidAt as string|null,confirmationUrl});
 }
 async create(expected:Readonly<LiveBinding>,request?:Readonly<CreateRequest>|null,createExpiresAt?:number) {
  const b=this.expected(expected);
  verify(request && record(request.amount) && request.amount.value===formatMinor(b.amountMinor) && request.amount.currency==='RUB' && request.capture===true && record(request.metadata) && request.metadata.order_id===b.intent && record(request.confirmation) && request.confirmation.type==='redirect');
  const url=request.confirmation.return_url;let parsed:URL;try {parsed=new URL(url);} catch {throw new HttpError(409,'payment_mismatch');}
  verify(typeof url==='string' && url.length<=2048 && !/[\u0000-\u0020\u007f]/.test(url) && parsed.protocol==='https:' && !parsed.username && !parsed.password && typeof request.description==='string' && Array.from(request.description).length>0 && Array.from(request.description).length<=128 && !/[\u0000-\u001f\u007f]/.test(request.description));
  verify(Object.keys(request).length===5 && Object.keys(request.amount).length===2 && Object.keys(request.confirmation).length===2 && Object.keys(request.metadata).length===1);
  const payment=this.payment(await this.request('/payments',request,b.intent,createExpiresAt),b);
  if(payment.status==='pending')verify(payment.confirmationUrl!==null);return payment;
 }
 async fetch(paymentId:string,expected?:Readonly<LiveBinding>) {
  const b=this.expected(expected);id(paymentId);return this.payment(await this.request(`/payments/${encodeURIComponent(paymentId)}`),b,paymentId);
 }
 async fetchRefund(refundId:string,expected?:Readonly<LiveBinding>,paymentId?:string):Promise<VerifiedRefund> {
  const b=this.expected(expected);id(refundId);id(paymentId);
  const raw=await this.request(`/refunds/${encodeURIComponent(refundId)}`);verify(id(raw.id)===refundId && id(raw.payment_id)===paymentId);
  verify(['pending','succeeded','canceled'].includes(String(raw.status)));const n=amount(raw.amount);verify(n<=b.amountMinor);parseProviderTimestamp(raw.created_at);
  // Refunds lack shop/test fields: obtain them only from bound canonical payment GET.
  await this.fetch(paymentId!,b);
  return Object.freeze({id:refundId,paymentId:paymentId!,provider:b.provider,merchant:b.merchant,mode:'live',status:raw.status as VerifiedRefund['status'],amountMinor:n,currency:'RUB'});
 }
}
