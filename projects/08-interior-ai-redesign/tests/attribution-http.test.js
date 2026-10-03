import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';
import { attributionFixture } from './attribution-fixtures.js';

// Real application handler, injected DB and finite request streams; never opens a listening socket.
test('ATTR/PARTNER API authentication Origin body bounds and absence of registry writes',async()=>{
  const f=attributionFixture(),id=f.account(),other=f.account(),p=f.partner(other);
  const secret=randomBytes(32).toString('hex'),session=randomBytes(32).toString('base64url');
  const essential='roomkind_session='+session,originalQuery=f.pool.query;
  f.pool.query=async(sql,v)=>sql.includes('FROM session s JOIN account a')?
    {rows:v[0]===tokenHash(session,secret)?[{id,email:'fixture@example.test'}]:[],rowCount:v[0]===tokenHash(session,secret)?1:0}:originalQuery(sql,v);
  const config={secret,secureCookie:true,runtime:'test',providerMode:'fixture',origin:'https://roomkind.example.test',platformDailyLimit:200,accountDailyLimit:20,storageDir:'/tmp/n8-f03b-injected-private'};
  const handler=createApp(f.pool,config).listeners('request')[0];
  async function request(method,path,body,origin=config.origin,cookies=essential) {
    const bytes=Buffer.from(body===undefined?'':typeof body==='string'?body:JSON.stringify(body));
    const req=Readable.from([bytes]);Object.assign(req,{method,url:path,headers:{'content-type':'application/json','content-length':String(bytes.length),...(origin?{origin}:{}),cookie:cookies},socket:{remoteAddress:'127.0.0.1'}});
    const headers={},res={headersSent:false,destroyed:false,setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(status,h){this.status=status;this.headersSent=true;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},end(value){this.body=JSON.parse(value);},destroy(){this.destroyed=true;}};
    await handler(req,res);return {status:res.status,headers,body:res.body};
  }
  assert.equal((await request('GET','/api/attribution',undefined,config.origin,'')).status,401);
  assert.equal((await request('POST','/api/attribution/state',{},config.origin,'')).status,401);
  for(const body of [null,[],{action:'accept'},'invalid','x'.repeat(16385)]) {
    assert.equal((await request('POST','/api/attribution/state',body)).status, typeof body==='string'&&body.length>16384?413:400);
  }
  const initial=await request('POST','/api/attribution/state',{});
  assert.equal(initial.status,200);assert.equal(initial.body.tracking_opt_in,false);assert.equal(initial.headers['set-cookie'],undefined);
  for(const origin of [null,'null','https://foreign.example.test']) {
    assert.equal((await request('GET','/api/attribution',undefined,origin)).status,403);
    assert.equal((await request('POST','/api/attribution/state',{},origin)).status,403);
    assert.equal((await request('POST','/api/attribution',{action:'accept'},origin)).status,403);
  }
  let r=await request('GET','/api/attribution');assert.equal(r.status,200);assert.equal(r.body.tracking_opt_in,false);assert.equal(r.headers['set-cookie'],undefined);
  assert.equal((await request('POST','/api/attribution',{action:'accept',account_id:other})).status,400);
  assert.equal((await request('POST','/api/attribution',{action:'capture',partner_code:p.code,consent:true})).status,400);
  assert.equal((await request('POST','/api/attribution','x'.repeat(16385))).status,413);
  for(const path of ['/api/partners','/api/partners/'+p.id,'/api/partners/aggregate']) {
    assert.equal((await request('POST',path,{})).status,404);
    assert.equal((await request('GET',path)).status,404);
  }
  r=await request('POST','/api/attribution',{action:'accept',partner_code:p.code});assert.equal(r.status,200);
  assert.match(r.headers['set-cookie'],/HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
  assert.deepEqual(Object.keys(r.body).sort(),['expires_at','partner_code','source','tracking_opt_in']);
  const tracking=r.headers['set-cookie'].split(';')[0];
  r=await request('POST','/api/attribution/state',{},config.origin,essential+'; '+tracking);
  assert.equal(r.status,200);assert.equal(r.body.source,'cookie');assert.equal(r.headers['set-cookie'],undefined);
  f.preferences.get(id).expires_at=new Date('2000-01-01');
  r=await request('POST','/api/attribution/state',{},config.origin,essential+'; '+tracking);
  assert.equal(r.body.source,null);assert.match(r.headers['set-cookie'],/Max-Age=0/);assert.doesNotMatch(r.headers['set-cookie'],/roomkind_session/);
  r=await request('POST','/api/attribution',{action:'deny'},config.origin,essential+'; '+tracking);
  assert.equal(r.status,200);assert.equal(r.body.tracking_opt_in,false);assert.match(r.headers['set-cookie'],/Max-Age=0/);assert.doesNotMatch(r.headers['set-cookie'],/roomkind_session/);
  r=await request('GET','/api/attribution');assert.equal(r.status,200);assert.equal(r.body.source,null);
  r=await request('POST','/api/payments',{package:'ROOM20',idempotency_key:'manual-with-essential-only',partner_code:p.code});
  assert.equal(r.status,202);assert.equal(r.headers['set-cookie'],undefined);assert.equal(f.intents.get(r.body.payment.payment_id).partner_id,p.id);
  assert.equal(r.body.payment.account_id,undefined);assert.equal(r.body.payment.partner_id,undefined);
});
