import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {hostedBoundary,responseGate} from '../scripts/ui/replicate-fixture.js';

const source=await readFile(new URL('../scripts/ui/replicate-cases.js',import.meta.url),'utf8');
const original=await readFile(new URL('../docs/telemetry/n8-20261002-1740/replicate-i8-hold-original-cases.js',import.meta.url),'utf8');
const bytes={depth:Buffer.from('depth'),generated:Buffer.from('output')};
const call=(request,method,path)=>new Promise((resolve,reject)=>{
  const req=request({method,path},res=>{res.resume();res.on('end',resolve);res.on('error',reject);});
  req.on('error',reject);req.end();
});
function helper(code=source) {
  const start=code.indexOf('export async function heldPair('),end=code.indexOf('export async function hostedCases(');
  assert.ok(start>=0&&end>start);
  return runInNewContext(code.slice(start,end).replace('export ','')+'\nheldPair',{
    assert,responseGate:()=>responseGate(200)
  });
}
function harness({reserveFails=false,beforeFails=false,checkFails=false,afterEnds=false,neverSends=false}={}) {
  let held=false,releases=0;const events=[],flights=[];
  const hold=async(value=true)=>{
    events.push(['hold',value]);if(held&&!value)throw new Error('monotonic billing state');held=value;
  };
  const fixture={async start(id,{gate,beforeRun=async()=>{}}={}) {
    assert.equal(held,false,'each claim must precede permanent hold');events.push(['claim',id]);
    const boundary=hostedBoundary(bytes,{gate}),controller=new AbortController();let joined=false;
    const done=(async()=>{
      await beforeRun();
      if(id==='before'&&beforeFails)throw new Error('injected before failure');
      if(held){releases++;return {completed:false,error:'billing_hold'};}
      events.push(['authorized',id]);
      if(afterEnds)return {completed:false,error:'early failure'};
      if(neverSends){await new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));return {completed:false,error:'canceled'};}
      await call(boundary.options.transportOptions.request,'POST','/prediction');
      events.push(['response',id,held]);
      await call(boundary.options.transportOptions.request,'GET','/prediction');
      await call(boundary.options.mediaOptions.request,'GET','/depth');
      await call(boundary.options.mediaOptions.request,'GET','/output');
      return {completed:true,error:null};
    })().catch(error=>({completed:false,error:error.message})).finally(()=>{joined=true;events.push(['joined',id]);});
    const flight={done,counts:boundary.counts,cancel(){controller.abort();gate?.release();events.push(['cancel',id]);},get joined(){return joined;}};
    flights.push(flight);return flight;
  }};
  return {events,flights,get held(){return held;},get releases(){return releases;},options:{fixture,afterId:'after',hold,
    reserveBefore:async()=>{assert.equal(held,false);events.push(['reserve','before']);if(reserveFails)throw new Error('reservation failed');return 'before';},
    beforeCheck:async(id,flight,result)=>{
      assert.equal(id,'before');assert.equal(held,true);assert.equal(result.completed,false);
      assert.deepEqual(flight.counts(),{api:0,post:0,get:0,delivery:0});assert.equal(releases,1);
      if(checkFails)throw new Error('check failed');events.push(['before-check']);
    },
    afterCheck:async(id,flight,result)=>{
      assert.equal(id,'after');assert.equal(held,true);assert.deepEqual(result,{completed:true,error:null});
      assert.deepEqual(flight.counts(),{api:2,post:1,get:1,delivery:2});events.push(['after-check']);
    }
  }};
}
for(const width of [1440,390])test(`actual heldPair scheduling at ${width}: authorization precedes permanent hold; zero/one create and release once`,async()=>{
  const h=harness();await helper()(h.options);assert.equal(h.held,true);assert.equal(h.releases,1);
  assert.deepEqual(h.events.slice(0,5),[['reserve','before'],['claim','after'],['authorized','after'],['claim','before'],['hold',true]]);
  assert.ok(h.events.findIndex(e=>e[0]==='hold')<h.events.findIndex(e=>e[0]==='response'));
  assert.ok(h.events.findIndex(e=>e[0]==='response')<h.events.findIndex(e=>e[0]==='before-check'));
  assert.deepEqual(h.events.find(e=>e[0]==='response'),['response','after',true]);
  assert.ok(h.flights.every(f=>f.joined));assert.equal(h.events.filter(e=>e[0]==='hold').length,1);
});
test('reservation/check/worker failure and missing gate entry release, cancel and join every flight',async()=>{
  for(const options of [{reserveFails:true},{beforeFails:true},{checkFails:true},{afterEnds:true},{neverSends:true}]) {
    const h=harness(options);await assert.rejects(helper()(h.options));
    assert.ok(h.flights.every(f=>f.joined));assert.equal(h.events.filter(e=>e[0]==='cancel').length,h.flights.length);
    assert.ok(h.flights.every(f=>f.counts().post<=1));
  }
});
test('monotonic oracle rejects a reintroduced false assignment in the actual helper',async()=>{
  const mutant=source.replace('const beforeResult=await before.done;','const beforeResult=await before.done;await hold(false);');
  assert.notEqual(mutant,source);const h=harness();await assert.rejects(helper(mutant)(h.options),/monotonic billing state/);
  assert.equal(h.held,true);assert.ok(h.flights.every(f=>f.joined));
});
test('authorization ordering oracle rejects hold moved before the authorized flight',async()=>{
  const mutant=source.replace('after=await fixture.start(afterId,{gate});','await hold();after=await fixture.start(afterId,{gate});');
  assert.notEqual(mutant,source);await assert.rejects(helper(mutant)(harness().options),/claim must precede permanent hold/);
});
test('original scoped finally reproduces immutable hold rejection; original runtime evidence remains',async()=>{
  const start=original.indexOf('    await check(`${width}: hosted hold before send');
  const end=original.indexOf('    await check(`${width}: hosted hold after',start);
  assert.ok(start>=0&&end>start);let held=false;
  const run=runInNewContext('async function reproduce(){let active;'+original.slice(start,end)+'}\nreproduce',{
    assert,width:1440,config:{},owner:'owner',evidence:[],upload:async()=>{},reserve:async()=>'before',
    check:async(name,fn)=>fn(),pool:{query:async sql=>{
      if(sql.includes('billing_hold=true'))held=true;
      if(sql.includes('billing_hold=false')&&held)throw new Error('monotonic billing state');
      return {rows:[{n:1}]};
    }},fixture:{start:async(id,{beforeRun})=>{await beforeRun();return {done:Promise.resolve({completed:false,error:'billing_hold'}),counts:()=>({api:0,post:0,get:0,delivery:0})};}},
    page:{locator:()=>({click:async()=>{},isHidden:async()=>true}),waitForFunction:async()=>{}}
  });
  await assert.rejects(run(),/monotonic billing state/);assert.equal(held,true);
  const log=await readFile(new URL('../docs/features/f07-replicate/i8-ui-1/browser.log',import.meta.url),'utf8');
  assert.match(log,/monotonic billing state/);assert.match(log,/protect_billing_state/);
});
test('all named hosted checks and reservation budget remain; unheld deletion precedes final hold',()=>{
  assert.doesNotMatch(source,/billing_hold\s*=\s*false/);
  assert.equal((source.match(/await check\(`/g)||[]).length,5);
  assert.ok(source.indexOf('hosted deletion during held remote response')<source.indexOf('await heldPair({fixture'));
  assert.equal((source.match(/await reserve\(\)/g)||[]).length,5);
});
