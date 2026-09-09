import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiOrigins, originsFor, variantOrigin } from '../shared/contracts/deployment.mjs';
import { createHttpServer } from '../apps/api/http.mjs';
import { createFrontendServer } from '../apps/frontend/server.mjs';
import { connect } from '../shared/client/api.mjs';

const publicA='https://n3-a.212.192.0.33.sslip.io';
test('public origins are exact HTTPS identities and reject lookalikes', async()=>{
  const server=createHttpServer({});server.listen(0,'127.0.0.1');await once(server,'listening');
  const target=`http://127.0.0.1:${server.address().port}/api/command`;
  try {
    for(const variant of ['A','B','C','D']) {
      const origin=originsFor(variant)[2],response=await fetch(target,{method:'OPTIONS',headers:{Origin:origin}});
      assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
      assert.equal(variantOrigin('A',origin),publicA);
    }
    for(const origin of [publicA+'.attacker.example',publicA+':444',publicA.replace('https:','http:'),'https://attacker.example']) {
      assert.equal(apiOrigins.has(origin),false);assert.throws(()=>variantOrigin('A',origin));
      const response=await fetch(target,{method:'OPTIONS',headers:{Origin:origin,Host:'n3-a.212.192.0.33.sslip.io','X-Forwarded-Host':'n3-a.212.192.0.33.sslip.io'}});
      assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
    }
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('public frontend CSP names only configured frame parents and B child',async()=>{
  const root=await mkdtemp(join(tmpdir(),'n3-public-csp-'));await writeFile(join(root,'index.html'),'<h1>fixture</h1>');
  const server=createFrontendServer({staticRoot:root});server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{Host:'attacker.example'}});
    assert.equal(response.status,200);const csp=response.headers.get('Content-Security-Policy');
    const parent=csp.split(';').find(x=>x.trim().startsWith('frame-ancestors'));
    const child=csp.split(';').find(x=>x.trim().startsWith('frame-src'));
    assert.ok(parent.includes(publicA));assert.ok(child.includes(originsFor('B')[2]));
    assert.ok(!parent.includes(originsFor('D')[2]));assert.doesNotMatch(csp,/attacker|\*/);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});

test('D handoff pins the public A origin before attaching the session fragment',async()=>{
  const saved={location:globalThis.location,sessionStorage:globalThis.sessionStorage};
  const session={token:'synthetic-test-token',actorId:'owner',actors:[{id:'owner',role:'merchant'}]};
  try {
    globalThis.location={origin:originsFor('D')[2],hash:'',href:originsFor('D')[2]+'/?target=https://attacker.example'};
    globalThis.sessionStorage={getItem:()=>JSON.stringify(session)};
    const api=await connect('D','merchant'),url=new URL(api.handoff('artifact-1'));
    assert.equal(url.origin,publicA);assert.equal(url.pathname,'/');assert.equal(url.search,'');
    assert.ok(new URLSearchParams(url.hash.slice(1)).has('handoff'));
    globalThis.location.origin=publicA+'.attacker.example';assert.throws(()=>api.handoff('artifact-1'));
  } finally {for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
