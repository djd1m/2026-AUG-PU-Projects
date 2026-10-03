import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';
import { sharingFixture, publication } from './sharing-fixtures.js';

// Actual app handler + finite streams + injected DB, no listening socket.
export function injectedRequest(handler,config) {
  return async(method,path,{body,session,origin=config.origin,ip='127.0.0.1',abort=false}={})=>{
    const bytes=Buffer.from(body===undefined?'':typeof body==='string'?body:JSON.stringify(body));
    const req=Readable.from([bytes]);Object.assign(req,{method,url:path,headers:{'content-type':'application/json','content-length':String(bytes.length),
      ...(origin?{origin}:{}),...(session?{cookie:'roomkind_session='+session}:{})},socket:{remoteAddress:ip}});
    const headers={},res=new EventEmitter();Object.assign(res,{headersSent:false,destroyed:false,
      setHeader(k,v){headers[k.toLowerCase()]=v;},removeHeader(k){delete headers[k.toLowerCase()];},
      writeHead(status,h){this.status=status;this.headersSent=true;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},
      end(value){this.data=Buffer.from(value??'');this.emit(abort?'close':'finish');},destroy(){this.destroyed=true;this.emit('close');}});
    await handler(req,res);return {status:res.status,headers,data:res.data,json:()=>JSON.parse(res.data.toString())};
  };
}
test('F04 actual handler owner/raw guards, public pages/media/list, origin/body/rate and response events',async()=>{
  const f=await sharingFixture();try {
    const own=randomBytes(32).toString('base64url'),other=randomBytes(32).toString('base64url');
    f.state.sessions.set(tokenHash(own,f.config.secret),f.owner);f.state.sessions.set(tokenHash(other,f.config.secret),randomUUID());
    const server=createApp(f.db,f.config),request=injectedRequest(server.listeners('request')[0],f.config);
    const base='/api/jobs/'+f.id;
    assert.equal((await request('POST',base+'/share-attempt',{body:{event_key:randomUUID(),mode:'download'}})).status,401);
    assert.equal((await request('POST',base+'/share-attempt',{session:own,origin:'http://evil',body:{}})).status,403);
    assert.equal((await request('POST',base+'/publication',{session:own,body:'x'.repeat(16385)})).status,413);
    assert.equal((await request('POST',base+'/publication',{session:other,body:publication()})).status,404);
    const key=randomUUID(),input={event_key:key,mode:'download'};
    const a=await request('POST',base+'/share-attempt',{session:own,body:input});assert.equal(a.status,200);
    assert.equal((await request('GET',a.json().artifact,{session:other})).status,404);
    const failed=await request('GET',a.json().artifact,{session:own,abort:true});assert.equal(failed.status,200);
    await new Promise(resolve=>setImmediate(resolve));assert.equal([...f.state.events.values()].includes('export_delivered'),false);
    const image=await request('GET',a.json().artifact,{session:own});assert.equal(image.status,200);
    assert.match(image.headers['cache-control'],/private.*no-store/);assert.match(image.headers['x-robots-tag'],/noindex/);
    assert.match(image.headers['content-disposition'],/attachment/);
    await new Promise(resolve=>setImmediate(resolve));assert.equal([...f.state.events.values()].filter(v=>v==='export_delivered').length,1);
    assert.equal([...f.state.events.values()].includes('share_completed'),false);
    const published=await request('POST',base+'/publication',{session:own,body:publication()});assert.equal(published.status,201);
    const v=published.json();
    for(const path of [v.page,v.composite,'/api/publications','/examples']) {
      const r=await request('GET',path);assert.equal(r.status,200);assert.equal(r.headers['cache-control'],'no-store');
      assert.ok(!r.data.toString().includes(f.id));
    }
    for(const path of [v.page+'/original',v.page+'/result',v.page+'/'+f.uploadId,'/api/uploads/'+f.uploadId,base+'/result']) {
      const r=await request('GET',path);assert.ok([401,404].includes(r.status));assert.ok(!r.headers['content-type'].startsWith('image/'));
    }
    for(const path of ['/api/publications?limit=21','/api/publications?limit=1&limit=2','/examples?bad=true',v.page+'?removeBadge=true'])assert.equal((await request('GET',path)).status,400);
    assert.equal((await request('GET','/api/publications',{body:'x'.repeat(16385)})).status,413);
    const revoked=await request('DELETE',base+'/publication',{session:own});assert.equal(revoked.status,200);
    for(const path of [v.page,v.composite]) {const r=await request('GET',path);assert.equal(r.status,404);assert.equal(r.headers['content-type'].startsWith('image/'),false);}
    assert.equal((await request('GET','/api/publications')).json().items.length,0);
    for(let i=0;i<120;i++)assert.equal((await request('GET','/api/publications',{ip:'127.0.0.2'})).status,200);
    const rate=await request('GET','/api/publications',{ip:'127.0.0.2'});assert.equal(rate.status,429);assert.equal(rate.headers['retry-after'],'60');
  }finally{await f.cleanup();}
});
