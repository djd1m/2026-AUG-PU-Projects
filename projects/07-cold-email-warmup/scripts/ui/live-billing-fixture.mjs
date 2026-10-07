// Operator-only local fixture. The accepted application runs unchanged; no real provider I/O.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { request } from 'node:http';
import { application } from '/app/dist/server.js';
import { loadConfig } from '/app/dist/config.js';
import { createPool } from '/app/dist/db.js';
import { HttpError } from '/app/dist/errors.js';
const config=loadConfig();
assert.equal(config.origin,'https://n7-ui.example.test');
assert.match(new URL(config.databaseUrl).pathname,/^\/n7_live_ui_a[1-9][0-9]*_20261007$/);
assert.equal(config.billingMode,'live_provider');
assert.equal(config.liveBilling.amountMinor,99000);
assert.equal(config.liveBilling.shopId,'990000007');
assert.equal(config.liveBilling.secretKey,'N7_PRIVATE_FIXTURE_ONLY_NO_REAL_PROVIDER');
assert.equal(config.dispatchMode,'disabled');assert.equal(config.pollMode,'disabled');
const pool=createPool(config.databaseUrl), payments=new Map(), refunds=new Map();
let unavailable=false, holdNext=false, held=null;
const copy=x=>structuredClone(x);
const provider={
 async create(binding,body) {
  assert.equal(binding.amountMinor,99000);assert.equal(binding.durationDays,30);assert.equal(binding.currency,'RUB');
  assert.equal(body.amount.value,'990.00');assert.equal(body.confirmation.return_url,config.origin+'/app?billingIntent='+binding.intent);
  const old=[...payments.values()].find(p=>p.intent===binding.intent);if(old){assert.deepEqual(Object.fromEntries(Object.keys(binding).map(k=>[k,old[k]])),binding);return copy(old);}
  const p={...binding,id:randomUUID(),status:'pending',paid:false,paidAt:null,confirmationUrl:'https://yoomoney.ru/checkout/payments/v2/contract?orderId='+binding.intent};payments.set(p.id,p);return copy(p);
 },
 async fetch(id,expected) {
  if(unavailable)throw new HttpError(503,'provider_unavailable');
  const p=payments.get(id);assert(p,'fixture payment exists');if(expected)for(const k of Object.keys(expected))assert.equal(p[k],expected[k]);
  if(holdNext){holdNext=false;await new Promise(resolve=>{held=resolve;});}
  return copy(p);
 },
 async fetchRefund(id){const r=refunds.get(id);assert(r);return copy(r);},
 async fetchRefundContext(id,resolveBinding){const r=refunds.get(id);assert(r);const p=payments.get(r.paymentId);assert(p);const binding=await resolveBinding({provider:p.provider,merchant:p.merchant,mode:'live',paymentId:p.id});return binding?{binding,payment:copy(p),refund:copy(r)}:null;}
};
const app=await application(config,pool,{canonicalProvider:provider});
await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(config.port,'0.0.0.0',resolve);});
function reply(value){process.stdout.write(JSON.stringify(value)+'\n');}
reply({ok:true,ready:true,transport:'private HTTP behind synthetic HTTPS browser route; no production TLS proof'});
async function owned(input){assert.match(input.intent,/^[0-9a-f-]{36}$/);const row=(await pool.query("SELECT i.* FROM live_billing_intent i JOIN account a ON a.tenant_id=i.tenant_id WHERE i.id=$1 AND a.email LIKE 'n7-live-ui-%@example.test'",[input.intent])).rows[0];assert(row,'owned disposable intent');const p=payments.get(row.payment_id);assert(p);assert.equal(p.intent,row.id);assert.equal(p.tenant,row.tenant_id);return {row,p};}
async function webhook(refund){return new Promise((resolve,reject)=>{const data=JSON.stringify({event:'refund.succeeded',object:{id:refund}});const req=request({hostname:'127.0.0.1',port:config.port,path:'/api/billing/webhooks/yookassa',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{res.resume();res.on('end',()=>{assert.equal(res.statusCode,200);resolve();});});req.on('error',reject);req.end(data);});}
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{void(async()=>{
 const input=JSON.parse(line);let result={};
 if(input.action==='hold'){assert(!held);holdNext=true;}
 else if(input.action==='held'){result={held:Boolean(held)};}
 else if(input.action==='release'){assert(held);held();held=null;}
 else if(input.action==='outage'){assert.equal(typeof input.enabled,'boolean');unavailable=input.enabled;}
 else if(['pending','succeeded','canceled','refund','snapshot'].includes(input.action)){
  const {row,p}=await owned(input);
  if(input.action==='succeeded'){assert(['pending','succeeded'].includes(p.status));p.status='succeeded';p.paid=true;p.paidAt??=new Date().toISOString();}
  if(input.action==='pending')assert.equal(p.status,'pending');
  if(input.action==='canceled'){assert.equal(p.status,'pending');p.status='canceled';}
  if(input.action==='refund'){assert.equal(p.status,'succeeded');const id=randomUUID();refunds.set(id,{id,paymentId:p.id,provider:p.provider,merchant:p.merchant,mode:'live',status:'succeeded',amountMinor:1,currency:'RUB'});await webhook(id);}
  const e=(await pool.query('SELECT paid_at,expires_at,revoked_at FROM live_billing_entitlement WHERE intent_id=$1',[row.id])).rows[0];
  result={state:p.status,tenant:row.tenant_id,paidAt:p.paidAt,entitlement:e??null};
 } else throw new Error('unknown_action');
 reply({ok:true,result});
})().catch(()=>reply({ok:false,kind:'fixture_control_failed'}));});
let closing=false;async function close(){if(closing)return;closing=true;held?.();lines.close();app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await pool.end();}
lines.on('close',()=>{void close();});
process.once('SIGTERM',()=>{void close();});
