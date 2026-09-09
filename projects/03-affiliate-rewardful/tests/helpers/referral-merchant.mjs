// Isolated browser acceptance harness only; never invoked by the application entrypoint.
import { createServer as httpServer, request } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile,cp,mkdir } from 'node:fs/promises';
import { createHttpServer } from '../../apps/api/http.mjs';
import { createFrontendServer } from '../../apps/frontend/server.mjs';
import { createReferralMerchantClient,referralTokenFromCookie } from '../../shared/integrations/merchant-client.mjs';
import { referralPaymentFixture } from './referral-payment-fixture.mjs';

const origins=['a','b','c','d'].map(v=>`https://n3-${v}.212.192.0.33.sslip.io`);
const variants=['a-merchant','b-customer','c-partner','d-agent'];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function html(res,body) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Изолированный SaaS-магазин</title><style>body{max-width:640px;margin:40px auto;padding:20px;font:18px system-ui}label,input,button{display:block;margin:12px 0;max-width:100%;box-sizing:border-box}input,button{padding:12px}p{overflow-wrap:anywhere}</style><h1>Изолированный SaaS-магазин</h1><p>Тест API провайдера и почты. Реальные деньги и письма не отправляются.</p>${body}</html>`);}
const redirect=(res,path)=>{res.writeHead(303,{Location:path});res.end();};
async function form(req) {let value='';for await(const chunk of req){value+=chunk;if(value.length>8192)throw new Error('Body too large');}return Object.fromEntries(new URLSearchParams(value));}
const listen=(server,port)=>new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));

export async function startReferralMerchant() {
  const cleanups=[],servers=[],sessions=new Map();let lastOrder=null;
  const x=await referralPaymentFixture({after:fn=>cleanups.push(fn)});
  const tls={key:await readFile('/app/.runtime/referral-e2e/key.pem'),cert:await readFile('/app/.runtime/referral-e2e/cert.pem')};
  const api=createHttpServer(x.f.app,{mode:'hybrid'});await listen(api,13030);servers.push(api);
  const merchantClient=createReferralMerchantClient({baseUrl:'http://127.0.0.1:13030',secret:x.key,mode:'isolated-test'});
  x.faults.beforeReturn=async payment=>{payment.confirmation.confirmation_url=`https://merchant.example/pay/${payment.id}`;};
  const tenant=x.config.tenantId;
  const merchant=httpsServer(tls,async(req,res)=>{
    try {
      const url=new URL(req.url,'https://merchant.example');
      if(req.method==='POST' && req.headers.origin!=='https://merchant.example') {res.writeHead(403);return res.end();}
      let sid=/merchant_session=([a-f0-9-]+)/.exec(req.headers.cookie ?? '')?.[1],session=sessions.get(sid);
      if(url.pathname==='/signup' && req.method==='GET') return html(res,`<script src="${origins[0]}/api/referrals/${tenant}/tracker.js" defer></script><form method="post" action="/signup"><label>Email <input name="email" type="email" required></label><label>Промокод <input name="promo"></label><button id="signup">Зарегистрироваться</button></form>`);
      if(url.pathname==='/signup' && req.method==='POST') {
        const input=await form(req);sid=randomUUID();session={customerId:randomUUID(),email:input.email,promoCode:input.promo || undefined,visitToken:referralTokenFromCookie(req.headers.cookie,tenant),code:'471829'};
        sessions.set(sid,session);res.setHeader('Set-Cookie',`merchant_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax`);return redirect(res,'/verify');
      }
      if(!session && !url.pathname.startsWith('/pay/')) {res.writeHead(401);return res.end('Merchant session required');}
      if(url.pathname==='/verify' && req.method==='GET')return html(res,'<p>Изолированный почтовый ящик: код <strong id="mail-code">471829</strong></p><form method="post" action="/verify"><label>Код подтверждения <input name="code" required></label><button id="verify">Подтвердить email</button></form>');
      if(url.pathname==='/verify' && req.method==='POST') {
        const input=await form(req);if(input.code!==session.code){res.writeHead(400);return res.end('Wrong code');}
        await merchantClient.bindCustomer({customerId:session.customerId,email:session.email,emailVerified:true,...(session.visitToken?{visitToken:session.visitToken}:{}),...(session.promoCode?{promoCode:session.promoCode}:{})});
        session.verified=true;return redirect(res,'/invoice');
      }
      if(url.pathname==='/invoice' && req.method==='GET')return html(res,'<p>Счёт: 1 000 ₽ за подписку. Сумма определяется серверным каталогом.</p><form method="post" action="/checkout"><button id="checkout">Перейти к оплате</button></form>');
      if(url.pathname==='/checkout' && req.method==='POST') {
        if(!session.verified)throw new Error('Verified signup required');
        session.key??=randomUUID();const order=await merchantClient.createCheckout({customerId:session.customerId,amountMinor:100000,idempotencyKey:session.key});
        session.order=order;lastOrder=order;return redirect(res,order.confirmationUrl);
      }
      if(url.pathname.startsWith('/pay/')) {
        const id=url.pathname.split('/').at(-1);if(!x.payments.has(id)){res.writeHead(404);return res.end();}
        if(req.method==='GET')return html(res,`<p>Изолированный эмулятор платёжного API.</p><form method="post" action="/pay/${escape(id)}"><button id="pay">Подтвердить тестовый платёж</button></form>`);
        const payment=x.succeed(id);
        const response=await fetch('http://127.0.0.1:13030/api/webhooks/yookassa',{method:'POST',headers:{'Content-Type':'application/json'},body:x.notification('payment.succeeded',payment)});
        if(!response.ok)throw new Error('Webhook rejected');return redirect(res,'/complete');
      }
      if(url.pathname==='/complete' && req.method==='GET') {
        const order=session.order && await merchantClient.getOrder({orderId:session.order.orderId});
        const entitled=order?.verified && order.netAmountMinor>0;
        return html(res,`<p id="fulfillment" data-confirmed="${!!entitled}">${entitled?'Оплата подтверждена через N3; тестовый доступ открыт.':'Подтверждённой оплаты нет; доступ закрыт.'}</p>`);
      }
      res.writeHead(404);res.end();
    } catch(error) {res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.code || error.message);}
  });await listen(merchant,14140);servers.push(merchant);
  for(let i=0;i<4;i++) {
    const root=`/tmp/n3-browser-public-${i}`;await mkdir(root,{recursive:true});
    await cp(`/app/variants/${variants[i]}/app`,root,{recursive:true});
    for(const name of ['client','ui','contracts'])await cp(`/app/shared/${name}`,`${root}/shared/${name}`,{recursive:true});
    await cp('/app/apps/frontend/fixtures/mobile.html',`${root}/mobile.html`);
    const front=createFrontendServer({staticRoot:root,apiOrigin:'http://127.0.0.1:13030'});await listen(front,13031+i);servers.push(front);
    const secure=httpsServer(tls,(req,res)=>{const p=request(`http://127.0.0.1:${13031+i}${req.url}`,{method:req.method,headers:req.headers},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);});p.on('error',()=>{res.writeHead(503);res.end();});req.pipe(p);});
    await listen(secure,14131+i);servers.push(secure);
  }
  // Dedicated browser proxy maps exact production origins into this isolated schema.
  // Unlisted hosts are refused; it never reaches a public production backend.
  const targets=new Map(origins.map((origin,i)=>[new URL(origin).host+':443',14131+i]));targets.set('merchant.example:443',14140);
  const proxy=httpServer((req,res)=>{res.writeHead(403);res.end();});
  proxy.on('connect',(req,socket,head)=>{const port=targets.get(req.url);if(!port)return socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const upstream=connect(port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());});
  await listen(proxy,13143);servers.push(proxy);
  const ownerMe=await x.f.app.identity.me(x.owner.token),partnerMe=await x.f.app.identity.me(x.partner.token);
  const control=httpServer(async(req,res)=>{
    if(req.headers.origin){res.writeHead(403);return res.end();}
    let data;
    if(req.url==='/context')data={ownerEmail:ownerMe.email,partnerEmail:partnerMe.email,password:'Referral payments test password 52!',tenantId:tenant,partnerId:x.joined.actorId,partnerMembershipId:x.joined.membershipId,origins};
    else if(req.url==='/metrics')data=await x.f.app.referrals.status(x.owner.token,x.owner.membershipId);
    else if(req.url==='/refund' && req.method==='POST' && lastOrder){await x.refund(lastOrder,100000);data={refunded:true};}
    else{res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
  });await listen(control,13144);servers.push(control);
  return {close:async()=>{for(const server of servers){server.closeAllConnections();server.close();}for(const cleanup of cleanups.reverse())await cleanup();}};
}
if(process.argv[1]?.endsWith('/referral-merchant.mjs')) {
  const harness=await startReferralMerchant();process.stdout.write('REFERRAL_BROWSER_READY\n');
  process.on('SIGTERM',async()=>{await harness.close();process.exit(0);});
}
