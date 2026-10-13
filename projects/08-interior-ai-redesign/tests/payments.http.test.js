import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createProvider } from '../web/provider.js';
const config={providerMode:'live',shopId:'123',providerSecret:'synthetic-test-secret'};
const intent={provider_id:randomUUID()};
const payment=()=>({id:intent.provider_id});
test('PAY-02 local HTTP cap, no redirect, malformed, slow headers and slow body timeout',async()=>{
  let mode='ok',redirectHits=0;
  const server=createServer((req,res)=>{
    if(req.url==='/redirect-target'){redirectHits++;res.end('{}');return;}
    if(mode==='redirect'){res.writeHead(302,{location:'/redirect-target'});res.end();}
    else if(mode==='large'){res.end('x'.repeat(65537));}
    else if(mode==='malformed'){res.end('{');}
    else if(mode==='slow'||mode==='slow-body'){if(mode==='slow-body'){res.writeHead(200);res.write('{');}const timer=setTimeout(()=>res.end('{}'),6000);res.on('close',()=>clearTimeout(timer));}
    else res.end(JSON.stringify(payment()));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  const adapter=createProvider(config,{fetchImpl:(_url,options)=>fetch(url,options)});
  try {
    assert.equal((await adapter.payment(intent.provider_id)).id,intent.provider_id);
    for(mode of ['large','redirect','malformed','slow','slow-body'])await assert.rejects(adapter.payment(intent.provider_id),e=>e.status===503);
    assert.equal(redirectHits,0);
  }finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
