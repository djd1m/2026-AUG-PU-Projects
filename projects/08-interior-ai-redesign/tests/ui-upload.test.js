// Local observation-protocol tests only; not browser or business-flow evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {upload} from '../scripts/ui/browser-cases.js';

const oldId='11111111-1111-4111-8111-111111111111';
const newId='22222222-2222-4222-8222-222222222222';
const otherId='33333333-3333-4333-8333-333333333333';
const metadata=id=>({id,width:640,height:480,mime:'image/webp',created_at:'2026-10-03T02:00:00.000Z'});

function observation({before=[metadata(oldId)],after=[...before,metadata(newId)],selected=newId,postStatus=201,ownerStatus=200,options=[oldId]}={}) {
  let value=oldId,ownerReads=0,bodyReads=0,clicked=false,stalePolls=0;
  const response={status:()=>postStatus,json:()=>{bodyReads++;throw new Error('Network.getResponseBody: content evicted from inspector cache');}};
  const document={querySelector:selector=>{assert.equal(selector,'#upload-choice');return {value};}};
  const fetch=async(path,init)=>{
    assert.equal(path,'/api/uploads');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');
    const rows=ownerReads++===0?before:after;
    return {status:ownerStatus,json:async()=>({uploads:rows})};
  };
  const invoke=(fn,arg)=>runInNewContext('('+fn.toString()+')',{document,fetch})(arg);
  const page={
    evaluate:fn=>invoke(fn),
    locator:selector=>({
      evaluateAll:fn=>fn(options.map(value=>({value}))),
      setInputFiles:async path=>{assert.equal(selector,'#file');assert.ok(path.endsWith('/upload.png'));},
      click:async()=>{assert.equal(selector,'#upload-form button');clicked=true;},
      inputValue:async()=>{assert.equal(selector,'#upload-choice');return value;}
    }),
    waitForResponse:predicate=>{
      assert.equal(predicate({url:()=>'/api/uploads',request:()=>({method:()=> 'GET'})}),false);
      assert.equal(predicate({url:()=>'/api/uploads',request:()=>({method:()=> 'POST'})}),true);
      return Promise.resolve(response);
    },
    waitForFunction:async(fn,arg)=>{
      assert.equal(clicked,true);
      if(invoke(fn,arg))return;
      stalePolls++;value=selected;
      if(!invoke(fn,arg))throw new Error('fresh selection timeout');
    }
  };
  return {page,counts:()=>({ownerReads,bodyReads,clicked,stalePolls})};
}
const config={storageDir:'/tmp/owned-ui-fixture'};

test('evicted CDP body is never read; fresh DOM UUID binds to authenticated owner metadata',async()=>{
  const h=observation();assert.equal(await upload(h.page,config),newId);
  assert.deepEqual(h.counts(),{ownerReads:2,bodyReads:0,clicked:true,stalePolls:1});
});
test('stale selected upload cannot satisfy a new successful POST',async()=>{
  const h=observation({selected:oldId});
  await assert.rejects(upload(h.page,config),/fresh selection timeout/);
});
test('existing owner UUID absent from DOM still cannot count as fresh',async()=>{
  const h=observation({before:[metadata(oldId),metadata(otherId)],selected:otherId});
  await assert.rejects(upload(h.page,config),/fresh selection timeout/);
});
test('previous DOM UUID absent from owner list still cannot count as fresh',async()=>{
  const h=observation({options:[oldId,otherId],selected:otherId,after:[metadata(oldId),metadata(otherId)]});
  await assert.rejects(upload(h.page,config),/fresh selection timeout/);
});
test('non-UUID selection is rejected',async()=>{
  const h=observation({selected:'forged-success'});
  await assert.rejects(upload(h.page,config),/fresh selection timeout/);
});
test('failed POST is rejected before DOM or metadata can imply success',async()=>{
  for(const postStatus of [200,400,500]){
    const h=observation({postStatus});await assert.rejects(upload(h.page,config),assert.AssertionError);
    assert.equal(h.counts().ownerReads,1);assert.equal(h.counts().bodyReads,0);
  }
});
test('new DOM UUID must match the single new owner entry',async()=>{
  const h=observation({selected:otherId});
  await assert.rejects(upload(h.page,config),/new owner upload must match DOM selection/);
});
test('missing or ambiguous new owner metadata fails',async()=>{
  for(const after of [[metadata(oldId)],[metadata(oldId),metadata(newId),metadata(otherId)]]){
    const h=observation({after});await assert.rejects(upload(h.page,config),/exactly one new upload/);
  }
});
test('missing dimensions, MIME or creation time fails',async()=>{
  for(const patch of [{width:undefined},{height:0},{mime:undefined},{created_at:undefined},{created_at:'invalid'}]){
    const h=observation({after:[metadata(oldId),{...metadata(newId),...patch}]});
    await assert.rejects(upload(h.page,config),assert.AssertionError);
  }
});
test('unauthenticated owner response and missing owner list fail closed',async()=>{
  const denied=observation({ownerStatus:401});
  await assert.rejects(upload(denied.page,config),/owner_uploads_http_401/);
  assert.equal(denied.counts().clicked,false);
  const missing=observation({after:null});
  await assert.rejects(upload(missing.page,config),/owner_uploads_missing/);
});
