import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHttpServer } from '../apps/api/http.mjs';

async function withServer(fn) {
  const calls=[];
  const app={createDemo:async input=>({fixture:true,input}),execute:async(...args)=>{calls.push(args);return {accepted:true};}};
  const server=createHttpServer(app);
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`,calls,app); }
  finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
test('HTTP refuses unsupported production mode',()=>assert.throws(()=>createHttpServer({}, {mode:'production'})));
test('HTTP rejects missing token before application command',()=>withServer(async(url,calls)=>{
  const r=await fetch(url+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dashboard',actorId:'x'})});
  assert.equal(r.status,401);assert.equal(calls.length,0);
}));
test('HTTP rejects hostile origin and permits explicit cross-origin preflight',()=>withServer(async(url,calls)=>{
  const no=await fetch(url+'/api/command',{method:'OPTIONS',headers:{Origin:'https://evil.invalid'}});
  assert.equal(no.status,403);assert.equal(no.headers.get('Access-Control-Allow-Origin'),null);
  const yes=await fetch(url+'/api/command',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:13031','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(yes.status,204);assert.equal(yes.headers.get('Access-Control-Allow-Origin'),'http://127.0.0.1:13031');assert.equal(calls.length,0);
}));
test('HTTP bounds body and rejects malformed JSON without invoking core',()=>withServer(async(url,calls)=>{
  for(const [body,status] of [['{bad',400],[JSON.stringify({padding:'x'.repeat(65536)}),413]]){
    const r=await fetch(url+'/api/command',{method:'POST',headers:{Authorization:'Bearer demo','Content-Type':'application/json'},body});
    assert.equal(r.status,status);
  }
  assert.equal(calls.length,0);
}));
test('HTTP forwards exact actor grant key and input; conceals internal errors',()=>withServer(async(url,calls,app)=>{
  const command={action:'registry.prepare',actorId:'owner',grantId:'grant1',input:{period:'2026-08'},idempotencyKey:'one'};
  const options={method:'POST',headers:{Authorization:'Bearer demo','Content-Type':'application/json'},body:JSON.stringify(command)};
  const ok=await fetch(url+'/api/command',options);assert.equal(ok.status,200);
  assert.deepEqual(calls[0],[{token:'demo',actorId:'owner',grantId:'grant1'},'registry.prepare',{period:'2026-08'},'one']);
  app.execute=async()=>{throw new Error('postgres://secret-sensitive')};
  const bad=await fetch(url+'/api/command',options);assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/secret-sensitive/);
}));
test('HTTP does not accept arbitrary methods or unknown routes',()=>withServer(async(url)=>{
  assert.equal((await fetch(url+'/api/command')).status,405);
  assert.equal((await fetch(url+'/api/unknown',{method:'POST'})).status,404);
}));
