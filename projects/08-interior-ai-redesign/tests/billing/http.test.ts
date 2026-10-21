import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AuthService} from '@n8/domain/identity';
import {passwords,tokenPort} from '@n8/adapters/auth';
import {PgAuthStore,PgProjects,PgRateGate} from '@n8/db/identity';
import {freshDb} from '../helpers/db';
import {checkoutHandler,offersHandler,ordersHandler,webhookHandler,billingServices} from '../../apps/web/src/server/billing';
import {sanitizeIngress} from '../../apps/web/src/server/peer';
import {loadConfig} from '../../apps/web/src/server/config';
import type {Base} from '../../apps/web/src/server/composition';
import {account,config,counts,FixtureProvider,offer,signal} from './fixtures';
let db:Awaited<ReturnType<typeof freshDb>>,base:Base,actor:string,token:string,provider:FixtureProvider;
const env={DATABASE_URL:'postgresql://localhost/test',N8_PUBLIC_ORIGIN:config.publicOrigin,N8_SESSION_SECRET:'s'.repeat(32),N8_ASSET_DIR:'/tmp'};
beforeEach(async()=>{db=await freshDb();actor=await account(db.pool);const tokens=tokenPort(env.N8_SESSION_SECRET);token=tokens.create();await db.pool.query("INSERT INTO session(account_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[actor,tokens.hash(token)]);
 base={pool:db.pool,config:{...loadConfig(env),paymentsMode:'live',paymentLive:{...config,secret:'offline-only'}},auth:new AuthService(new PgAuthStore(db.pool),passwords,tokens,{now:()=>new Date()}),projects:new PgProjects(db.pool),rate:new PgRateGate(db.pool),hashSubject:v=>tokens.hash(v)};provider=new FixtureProvider();});
afterEach(async()=>{await db.close();vi.restoreAllMocks();vi.unstubAllEnvs();});
function request(path:string,body?:unknown,headers:Record<string,string>={}){return new Request(config.publicOrigin+path,{method:body===undefined?'GET':'POST',headers:{'x-n8-peer':'185.71.76.10','content-type':'application/json',cookie:`n8_session=${token}`,origin:config.publicOrigin,'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});}
it('AC-billing-1 default off checkout503 webhook404 before body; offers honest empty and no external calls',async()=>{
 base.config.paymentsMode='off';base.config.paymentLive=undefined;const spy=vi.spyOn(provider,'createPayment');
 const req=request('/api/billing/checkout','{');const body=vi.spyOn(req.body!,'getReader');const response=await checkoutHandler(base,{provider})(req);expect(response.status).toBe(503);expect((await response.json()).error.code).toBe('PAYMENTS_DISABLED');expect(body).not.toHaveBeenCalled();
 const hook=request('/api/billing/webhook','{',{'x-n8-peer':'127.0.0.1'});expect((await webhookHandler(base,{provider})(hook)).status).toBe(404);expect(hook.bodyUsed).toBe(false);
 const offers=await offersHandler(base)(request('/api/billing/offers'));expect((await offers.json()).data).toEqual({enabled:false,offers:[]});expect(spy).not.toHaveBeenCalled();expect((await counts(db.pool,actor)).orders).toBe(0);
});
it('live startup requires explicit merchant/test/SKU and HTTPS origin; public offers expose whitelist only',async()=>{
 for(const extra of [{},{N8_PAYMENT_SHOP_ID:'1'},{N8_PAYMENT_SHOP_ID:'1',N8_PAYMENT_SECRET:'s',N8_PAYMENT_TEST_MODE:'true'}, {N8_PAYMENT_SHOP_ID:'1',N8_PAYMENT_SECRET:'s',N8_PAYMENT_TEST_MODE:'true',N8_PAYMENT_SKUS_JSON:JSON.stringify([offer]),N8_PUBLIC_ORIGIN:'http://localhost'}])expect(()=>loadConfig({...env,N8_PAYMENTS_MODE:'live',...extra})).toThrow();
 const response=await offersHandler(base)(request('/api/billing/offers'));const data=(await response.json()).data;expect(data).toEqual({enabled:true,offers:[offer]});expect(JSON.stringify(data)).not.toMatch(/secret|shopId/);
});
it('checkout pre-body authentication, exact Origin and atomic rate guard; no project CAS needed',async()=>{
 for(const [headers,status] of [[{cookie:''},401],[{origin:''},403],[{origin:'https://evil.invalid'},403]] as const){const req=request('/api/billing/checkout','{',headers);expect((await checkoutHandler(base,{provider})(req)).status).toBe(status);expect(req.bodyUsed).toBe(false);}
 const valid=await checkoutHandler(base,{provider})(request('/api/billing/checkout',{sku:'room'}));expect(valid.status).toBe(200);expect((await valid.json()).data).toMatchObject({priceMinor:19900,credits:10,state:'pending'});
 await db.pool.query('UPDATE rate_bucket SET count=60 WHERE subject_hash=$1',[base.hashSubject(actor)]);const limited=request('/api/billing/checkout','{');expect((await checkoutHandler(base,{provider})(limited)).status).toBe(429);expect(limited.bodyUsed).toBe(false);expect((await counts(db.pool,actor)).orders).toBe(1);
});
it('billing HTTP rejects JSON size/schema/key and never creates orders for malformed inputs',async()=>{
 for(const [body,headers,status] of [['{',{},400],['x'.repeat(256*1024+1),{},413],[{sku:'room',credits:100},{},422],[{sku:'room'},{'idempotency-key':'invalid'},400],[{sku:'missing'},{},422]] as const){const response=await checkoutHandler(base,{provider})(request('/api/billing/checkout',body,headers));expect(response.status).toBe(status);}
 expect((await counts(db.pool,actor)).orders).toBe(0);
});
it('webhook source rejected before bounded body; XFF cannot restore identity; mapped official peer accepted',async()=>{
 for(const ip of ['127.0.0.1','172.17.0.1','::1','unknown','']){const req=request('/api/billing/webhook','{',{'x-n8-peer':ip,'x-forwarded-for':'185.71.76.10'});expect([400,403]).toContain((await webhookHandler(base,{provider})(req)).status);expect(req.bodyUsed).toBe(false);}
 const checkout=await checkoutHandler(base,{provider})(request('/api/billing/checkout',{sku:'room'}));expect(checkout.status).toBe(200);const payment=provider.succeed([...provider.payments.keys()][0]);
 const body=signal(payment.id);const hook=request('/api/billing/webhook',body,{'x-n8-peer':'::ffff:185.71.76.10',origin:'',cookie:''});expect((await webhookHandler(base,{provider})(hook)).status).toBe(200);expect((await counts(db.pool,actor)).credits_available).toBe(10);
 const hex=request('/api/billing/webhook',body,{'x-n8-peer':'::ffff:b947:4c0a',origin:'',cookie:''});expect((await webhookHandler(base,{provider})(hex)).status).toBe(200);expect((await counts(db.pool,actor)).events).toBe(1);
});
it('actual HTTP listener overwrites spoofed source headers from loopback socket before webhook; no parsing/grant',async()=>{
 const handler=webhookHandler(base,{provider});const server=createServer((req,res)=>{void(async()=>{sanitizeIngress(req);const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);const r=new Request(config.publicOrigin+'/api/billing/webhook',{method:'POST',headers,body:Readable.toWeb(req),duplex:'half'} as RequestInit);const response=await handler(r);res.writeHead(response.status);res.end(await response.text());})().catch(()=>{res.writeHead(500);res.end();});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{const address=server.address();if(!address||typeof address==='string')throw Error();const response=await fetch(`http://127.0.0.1:${address.port}`,{method:'POST',headers:{'content-type':'application/json','x-n8-peer':'185.71.76.10','x-forwarded-for':'185.71.76.10',forwarded:'for=185.71.76.10'},body:'{'});expect(response.status).toBe(403);expect((await counts(db.pool,actor)).events).toBe(0);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('webhook malformed/oversized body and rate failure never invoke provider or occupy event',async()=>{
 const spy=vi.spyOn(provider,'getPayment');for(const [body,status] of [['{',400],['x'.repeat(256*1024+1),413],[JSON.stringify({type:'notification',event:'payment.succeeded',object:{id:'../x'}}),400]] as const)expect((await webhookHandler(base,{provider})(request('/api/billing/webhook',body))).status).toBe(status);
 await db.pool.query('UPDATE rate_bucket SET count=60 WHERE subject_hash=$1',[base.hashSubject('payment:185.71.76.10')]);const req=request('/api/billing/webhook','{');expect((await webhookHandler(base,{provider})(req)).status).toBe(429);expect(req.bodyUsed).toBe(false);expect(spy).not.toHaveBeenCalled();expect((await counts(db.pool,actor)).events).toBe(0);
});
it('owned return/history GET never grants credits; foreign ID404; DTO omits merchant/remote/account',async()=>{
 const response=await checkoutHandler(base,{provider})(request('/api/billing/checkout',{sku:'room'}));const {id}= (await response.json()).data;provider.succeed([...provider.payments.keys()][0]);const get=await ordersHandler(id,base)(request(`/api/billing/orders/${id}`));expect(get.status).toBe(200);const text=await get.text();expect(text).not.toMatch(/accountId|remoteId|secret|merchantId/);expect((await counts(db.pool,actor)).credits_available).toBe(0);
 const other=await account(db.pool),foreign=await billingServices(base,{provider}).store.prepare(other,randomUUID(),offer,config);expect((await ordersHandler(foreign.id,base)(request('/api/billing/orders/'+foreign.id))).status).toBe(404);
 const page=await ordersHandler(undefined,base)(request('/api/billing/orders'));expect((await page.json()).data.items).toHaveLength(1);
});
it('provider/source test injection is forbidden under production; no fake runtime config accepted',()=>{
 vi.stubEnv('NODE_ENV','production');expect(()=>webhookHandler(base,{sourceVerifier:()=>true})).toThrow('PAYMENT_TEST_INJECTION_FORBIDDEN');expect(()=>checkoutHandler(base,{provider})).toThrow('PAYMENT_TEST_INJECTION_FORBIDDEN');expect(()=>loadConfig({...env,N8_PAYMENTS_MODE:'fake'})).toThrow();
});
