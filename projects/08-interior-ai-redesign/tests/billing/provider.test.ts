import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createYooKassaProvider,isYooKassaPeer,httpsUrl} from '@n8/adapters/yookassa';
import {config} from './fixtures';
let server:Server;let origin:string;
let responder:(req:import('node:http').IncomingMessage,res:import('node:http').ServerResponse)=>void;
beforeEach(async()=>{server=createServer((req,res)=>responder(req,res));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error();origin=`http://127.0.0.1:${address.port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));vi.unstubAllEnvs();});
function provider(timeoutMs=500){return createYooKassaProvider({...config,secret:'offline-secret',testTransport:{timeoutMs,fetch:async(url,init)=>{expect(String(url)).toMatch(/^https:\/\/api\.yookassa\.ru\/v3\/(payments|refunds)/);return fetch(String(url).replace('https://api.yookassa.ru',origin),init);}}});}
function raw(id=randomUUID(),orderId=randomUUID()){return{id,status:'pending',amount:{value:'199.00',currency:'RUB'},recipient:{account_id:config.shopId},test:true,paid:false,metadata:{order_id:orderId},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/test'}};}
function json(res:import('node:http').ServerResponse,value:unknown){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));}
it('offline HTTP adapter creates exact RUB intent with Basic merchant auth and order UUID idempotence; retries same remote ID',async()=>{
 const keys:string[]=[],bodies:Record<string,unknown>[]=[],orderId=randomUUID(),id=randomUUID();
 responder=(req,res)=>{expect(req.url).toBe('/v3/payments');expect(req.method).toBe('POST');expect(req.headers.authorization).toBe(`Basic ${Buffer.from(config.shopId+':offline-secret').toString('base64')}`);keys.push(String(req.headers['idempotence-key']));let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{bodies.push(JSON.parse(body));json(res,raw(id,orderId));});};
 const p=provider(),input={orderId,amountMinor:19900,returnUrl:'https://n8.test/billing'};
 expect((await p.createPayment(input)).id).toBe(id);expect((await p.createPayment(input)).id).toBe(id);expect(keys).toEqual([orderId,orderId]);expect(bodies[0]).toMatchObject({amount:{value:'199.00',currency:'RUB'},capture:true,metadata:{order_id:orderId},confirmation:{return_url:'https://n8.test/billing'}});expect(bodies[1]).toEqual(bodies[0]);
});
it('offline HTTP adapter gets payment and distinct partial refund payment_id, exact decimal and safe HTTPS',async()=>{
 const id=randomUUID(),refundId=randomUUID(),p=provider();responder=(req,res)=>{if(req.url===`/v3/refunds/${refundId}`)json(res,{id:refundId,payment_id:id,status:'succeeded',amount:{value:'0.01',currency:'RUB'}});else json(res,{...raw(id),status:'succeeded',paid:true});};
 expect(await p.getRefund(refundId)).toEqual({id:refundId,paymentId:id,status:'succeeded',amountMinor:1,currency:'RUB'});expect(await p.getPayment(id)).toMatchObject({id,paid:true,amountMinor:19900});
 for(const url of ['http://evil.invalid','https://user:pass@yookassa.ru','javascript:alert(1)'])expect(()=>httpsUrl(url)).toThrow();expect(httpsUrl('https://yoomoney.ru/checkout/a')).toBe('https://yoomoney.ru/checkout/a');
});
it('adapter rejects wrong merchant/test/currency/object ID/metadata/decimal before trusting provider object',async()=>{
 const id=randomUUID(),p=provider();const good=raw(id);
 const values=[{...good,recipient:{account_id:'foreign'}},{...good,test:false},{...good,amount:{value:'199.00',currency:'USD'}},{...good,id:randomUUID()},{...good,metadata:{order_id:'bad'}},{...good,amount:{value:'1e2',currency:'RUB'}},{...good,amount:{value:'199.001',currency:'RUB'}},{...good,confirmation:{confirmation_url:'https://user:pass@evil.invalid'}}];
 for(const value of values){responder=(_req,res)=>json(res,value);await expect(p.getPayment(id)).rejects.toMatchObject({status:400});}
 let count=0;responder=(_req,res)=>{count++;json(res,good);};await expect(p.getPayment('../refunds/evil')).rejects.toMatchObject({status:400});expect(count).toBe(0);
});
it('provider HTTP redirect/error/content-type/invalid JSON/oversized declared and streamed bodies fail bounded with redacted503',async()=>{
 const p=provider(),id=randomUUID();let redirected=false;
 const handlers:typeof responder[]=[
  (_req,res)=>{res.writeHead(302,{location:origin+'/stolen'});res.end();},
  (_req,res)=>{res.writeHead(500,{'content-type':'application/json'});res.end('secret diagnostic');},
  (_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('secret diagnostic');},
  (_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{');},
  (_req,res)=>{res.writeHead(200,{'content-type':'application/json','content-length':'999999'});res.end('{}');},
  (_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('x'.repeat(65537));}
 ];
 for(const handler of handlers){responder=(req,res)=>{if(req.url==='/stolen')redirected=true;handler(req,res);};await expect(p.getPayment(id)).rejects.toMatchObject({status:503,code:'PAYMENT_PROVIDER_UNAVAILABLE'});}expect(redirected).toBe(false);
});
it('deadline covers both response headers and endless response body; no unbounded text allocation',async()=>{
 const p=provider(30),id=randomUUID();responder=()=>{};await expect(p.getPayment(id)).rejects.toMatchObject({status:503});
 responder=(_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');};await expect(p.getPayment(id)).rejects.toMatchObject({status:503});
});
it('closed official source networks support IPv4-mapped peers; loopback, gateway, missing and unknown never allowed',()=>{
 for(const ip of ['185.71.76.0','185.71.76.31','185.71.77.12','77.75.153.127','77.75.156.11','77.75.156.35','77.75.154.128','77.75.154.255','2a02:5180::1','::ffff:185.71.76.10'])expect(isYooKassaPeer(ip),ip).toBe(true);
 for(const ip of ['185.71.76.32','77.75.153.128','77.75.156.12','2a02:5181::1','127.0.0.1','::1','172.17.0.1','','unknown','185.71.76.1,127.0.0.1'])expect(isYooKassaPeer(ip),ip).toBe(false);
});
it('production cannot inject test transport or endpoint; secrets stay server-only constructor',()=>{
 vi.stubEnv('NODE_ENV','production');expect(()=>provider()).toThrow('PAYMENT_TEST_INJECTION_FORBIDDEN');expect(()=>createYooKassaProvider({...config,secret:'',testTransport:undefined})).toThrow('PAYMENT_CONFIG_INVALID');
});
