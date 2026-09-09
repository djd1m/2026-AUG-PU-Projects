// Isolated provider/browser harness. Never imported by the production entrypoint.
import { createServer as httpServer,request } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect } from 'node:net';
import { readFile,cp,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHttpServer } from '../../apps/api/http.mjs';
import { createFrontendServer } from '../../apps/frontend/server.mjs';
import { accessFixture,accessPassword } from './access-fixture.mjs';

const origins=['a','b','c','d'].map(v=>`https://n3-${v}.212.192.0.33.sslip.io`);
const variants=['a-merchant','b-customer','c-partner','d-agent'];
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const listen=(server,port)=>new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));
function html(res,body) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Изолированный Yandex ID</title><h1>Тестовый провайдер Yandex ID</h1><p>Реальные внешние аккаунты не используются.</p>${body}</html>`);}
export async function startAccessBrowser() {
  const cleanups=[],servers=[];
  const x=await accessFixture({after:fn=>cleanups.push(fn)});
  const legacyEmail=`legacy-${randomUUID()}@example.test`;
  await x.f.app.identity.register({email:legacyEmail,password:accessPassword,name:'Legacy security acceptance'});
  x.config.verificationRequired=true;await x.f.restart();
  const tls={key:await readFile('/app/.runtime/access-e2e/key.pem'),cert:await readFile('/app/.runtime/access-e2e/cert.pem')};
  const dynamicApp=new Proxy({}, {get:(_,key)=>x.f.app[key]});
  const api=createHttpServer(dynamicApp,{mode:'hybrid'});await listen(api,13030);servers.push(api);
  for(let i=0;i<4;i++) {
    const root=`/tmp/n3-access-public-${i}`;await mkdir(root,{recursive:true});await cp(`/app/variants/${variants[i]}/app`,root,{recursive:true});
    for(const name of ['client','ui','contracts'])await cp(`/app/shared/${name}`,`${root}/shared/${name}`,{recursive:true});
    await cp('/app/apps/frontend/fixtures/mobile.html',`${root}/mobile.html`);
    const front=createFrontendServer({staticRoot:root,apiOrigin:'http://127.0.0.1:13030'});await listen(front,13031+i);servers.push(front);
    const secure=httpsServer(tls,(req,res)=>{const p=request(`http://127.0.0.1:${13031+i}${req.url}`,{method:req.method,headers:req.headers},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);});p.on('error',()=>{res.writeHead(503);res.end();});req.pipe(p);});
    await listen(secure,14131+i);servers.push(secure);
  }
  const provider=httpsServer(tls,async(req,res)=>{
    try {
      const url=new URL(req.url,'https://oauth.yandex.ru');
      if(url.pathname!=='/authorize'){res.writeHead(404);return res.end();}
      if(req.method==='GET') {
        const input=Object.fromEntries(url.searchParams);
        if(input.code_challenge_method!=='S256' || !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge??''))throw new Error('PKCE required');
        return html(res,`<form method="post" action="/authorize">${['redirect_uri','state','code_challenge'].map(k=>`<input type="hidden" name="${k}" value="${escape(input[k])}">`).join('')}<label>External ID <input id="provider-id" name="externalId" required></label><label>Email <input id="provider-email" name="email" type="email" required></label><button id="provider-accept" name="decision" value="accept">Разрешить</button><button id="provider-deny" name="decision" value="deny" formnovalidate>Отказать</button></form>`);
      }
      if(req.method!=='POST' || req.headers.origin!=='https://oauth.yandex.ru')throw new Error('Origin required');
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new Error('Body limit');}
      const input=Object.fromEntries(new URLSearchParams(raw)),target=new URL(input.redirect_uri);
      if(!origins.includes(target.origin) || target.pathname!=='/api/account/yandex/callback')throw new Error('Callback denied');
      target.searchParams.set('state',input.state);
      if(input.decision==='deny')target.searchParams.set('error','access_denied');
      else target.searchParams.set('code',x.codeFor(input.externalId,input.email,input.code_challenge));
      res.writeHead(303,{Location:target.href});res.end();
    } catch {res.writeHead(400);res.end('Isolated provider rejected request');}
  });await listen(provider,14140);servers.push(provider);
  const targets=new Map(origins.map((origin,i)=>[new URL(origin).host+':443',14131+i]));targets.set('oauth.yandex.ru:443',14140);
  const proxy=httpServer((req,res)=>{res.writeHead(403);res.end();});
  proxy.on('connect',(req,socket,head)=>{const port=targets.get(req.url);if(!port)return socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const upstream=connect(port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());});
  await listen(proxy,13145);servers.push(proxy);
  const control=httpServer(async(req,res)=>{
    if(req.headers.origin){res.writeHead(403);return res.end();}
    try {
      const url=new URL(req.url,'http://127.0.0.1');let data;
      if(url.pathname==='/context')data={origins,legacyEmail,password:accessPassword};
      else if(url.pathname==='/proof') {const email=url.searchParams.get('email'),purpose=url.searchParams.get('purpose'),token=x.tokenFor(email,purpose);data={link:token?`${url.searchParams.get('origin')??origins[0]}/account#access=${purpose}&token=${token}`:null};}
      else if(url.pathname==='/facts')data={accounts:(await x.f.sql('SELECT count(*)::int AS n FROM accounts')).rows[0].n,
        pending:(await x.f.sql('SELECT count(*)::int AS n FROM email_flows WHERE used_at IS NULL')).rows[0].n};
      else if(url.pathname==='/advance' && req.method==='POST'){x.advance(61000);data={advanced:true};}
      else if(url.pathname==='/disabled' && req.method==='POST') {x.config.mail.enabled=false;x.config.yandex.enabled=false;x.config.verificationRequired=false;await x.f.restart();data={disabled:true};}
      else {res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));
    } catch {res.writeHead(503);res.end();}
  });await listen(control,13146);servers.push(control);
  return {close:async()=>{for(const server of servers){server.closeAllConnections();server.close();}for(const cleanup of cleanups.reverse())await cleanup();}};
}
if(process.argv[1]?.endsWith('/access-browser-server.mjs')) {
  const harness=await startAccessBrowser();process.stdout.write('ACCESS_BROWSER_READY\n');
  process.on('SIGTERM',async()=>{await harness.close();process.exit(0);});
}
