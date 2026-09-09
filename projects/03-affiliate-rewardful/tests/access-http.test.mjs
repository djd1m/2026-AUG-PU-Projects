import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHttpServer } from '../apps/api/http.mjs';
import { accessFixture,accessOrigin,accessPassword } from './helpers/access-fixture.mjs';

test('email HTTP activation is explicit POST without session and old registration cannot bypass proof',async t=>{
  const x=await accessFixture(t),server=createHttpServer(x.f.app,{mode:'hybrid'});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`,email=`${randomUUID()}@example.test`;
  const post=(name,input,origin=accessOrigin)=>fetch(`${base}/api/account/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(input)});
  assert.equal((await post('register',{email,name:'Proof'},'https://evil.example')).status,403);
  assert.equal((await post('register',{email,name:'Proof',password:accessPassword})).status,400);
  const requested=await post('register',{email,name:'Proof'});assert.equal(requested.status,200);assert.equal(requested.headers.get('set-cookie'),null);
  const token=x.tokenFor(email,'register');assert.ok(token);
  assert.equal((await fetch(`${base}/api/account/activate`)).status,405);
  assert.equal((await x.f.sql('SELECT * FROM user_sessions')).rowCount,0);
  assert.equal((await x.f.sql('SELECT used_at FROM email_flows')).rows[0].used_at,null);
  const activated=await post('activate',{token,password:accessPassword});assert.equal(activated.status,200);assert.equal(activated.headers.get('set-cookie'),null);
  assert.deepEqual((await activated.json()).data,{completed:true,loginRequired:true});
  assert.equal((await post('activate',{token,password:accessPassword})).status,400);
  const login=await post('login',{email,password:accessPassword});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly.*SameSite=Lax.*Secure/);assert.ok(!cookie.includes('Domain='));
  assert.equal((await login.json()).data.token,undefined);
});
test('Yandex HTTP uses host-only browser cookie exact callback origin and sanitized local error redirects',async t=>{
  const x=await accessFixture(t),server=createHttpServer(x.f.app,{mode:'hybrid'});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`,host=new URL(accessOrigin).host;
  // Node fetch rewrites Host; raw HTTP exercises the actual callback host boundary.
  const callbackGet=(url,headers)=>new Promise((resolve,reject)=>{const req=request(url,{headers},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));});req.on('error',reject);req.end();});
  const start=await fetch(`${base}/api/account/yandex/start`,{method:'POST',headers:{'Content-Type':'application/json',Origin:accessOrigin},body:JSON.stringify({intent:'login'})});
  assert.equal(start.status,200);const cookie=start.headers.get('set-cookie');assert.match(cookie,/n3_oauth=.*HttpOnly.*SameSite=Lax.*Max-Age=600.*Secure/);
  const data=(await start.json()).data,url=new URL(data.url);assert.equal(data.browser,undefined);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const state=url.searchParams.get('state'),code=x.codeFor();
  const callback=`${base}/api/account/yandex/callback?${new URLSearchParams({state,code})}`;
  const wrong=await callbackGet(callback,{Cookie:cookie.split(';')[0],Host:'wrong.example'});
  assert.equal(wrong.headers.location,'/account#access-error=invalid');assert.equal(x.calls.length,0);
  const accepted=await callbackGet(callback,{Cookie:cookie.split(';')[0],Host:host});
  assert.equal(accepted.status,303);assert.equal(accepted.headers.location,`${accessOrigin}/account`);
  assert.ok((accepted.headers['set-cookie']??[]).some(c=>c.startsWith('n3_session=') && c.includes('Secure') && !c.includes('Domain=')));
  const again=await callbackGet(callback,{Cookie:cookie.split(';')[0],Host:host});
  assert.equal(again.headers.location,'/account#access-error=invalid');
  assert.ok(!(again.headers['set-cookie']??[]).some(c=>c.startsWith('n3_session=')));
});
