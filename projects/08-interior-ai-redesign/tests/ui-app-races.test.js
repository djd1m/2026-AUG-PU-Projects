import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor(){this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.attributes={};this.style={setProperty(){}};}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  removeAttribute(key){delete this.attributes[key];}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(){return [];}
  get src(){return this.attributes.src;}
  set src(value){this.attributes.src=value;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
async function harness(){
  const elements=new Map(),calls=[];let delay=null,owner='A';
  const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  element('styles').children=['warm','minimal','afrohemian','playful'].map(style=>Object.assign(new Element(),{dataset:{style}}));
  const store=new Map();
  Object.assign(globalThis,{document:{getElementById:element,createElement:()=>new Element()},Option:class extends Element{constructor(label,value){super();this.textContent=label;this.value=value;}},sessionStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},location:{href:'https://n8-ui.test/',origin:'https://n8-ui.test'}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  globalThis.fetch=async(path,options={})=>{
    calls.push({path,options});if(delay){const result=delay(path,options);if(result)return result;}
    if(path==='/api/me')return response({account:{id:owner,email:owner+'@example.test',credits:20,billing_hold:false}});
    if(path==='/api/uploads')return response({uploads:[{id:'photoA',width:640,height:480},{id:'photoB',width:640,height:480}]});
    if(path.startsWith('/api/jobs?'))return response({jobs:[],next:null});
    if(path==='/api/attribution/state')return response({tracking_opt_in:false});
    if(path==='/api/payments/config')return response({package:'ROOM20',credits:20,amount_minor:90000,currency:'RUB',provider_mode:'fixture'});
    if(path.startsWith('/api/jobs/'))return response({job:{job_id:path.split('/')[3],status:'queued',attempts:0}});
    return response({});
  };
  await import('../web/public/app.js?test='+crypto.randomUUID());for(let i=0;i<8;i++)await tick();
  return {element,calls,store,setDelay:fn=>{delay=fn;},setOwner:value=>{owner=value;},close:()=>element('logout').onclick()};
}
test('actual app: delayed A, B selection/submission, no overlap/stale render or mismatched intent',async()=>{
  const h=await harness();let finish;try{
  h.element('upload-choice').value='photoA';h.element('upload-choice').onchange();
  h.setDelay((path)=>path==='/api/jobs'?new Promise(resolve=>{finish=resolve;}):null);
  const a=h.element('generate').onclick();await tick();
  h.element('upload-choice').value='photoB';h.element('upload-choice').onchange();
  assert.equal(h.element('generate').disabled,true);
  await h.element('generate').onclick();assert.equal(h.calls.filter(c=>c.path==='/api/jobs').length,1);
  finish(response({job_id:'jobA'},202));await a;
  assert.equal(h.element('result').hidden,true);assert.equal(h.store.has('roomkind:job:A'),false);
  let finishB;h.setDelay(path=>path==='/api/jobs'?new Promise(resolve=>{finishB=resolve;}):null);
  const b=h.element('generate').onclick();await tick();
  const submitted=JSON.parse(h.calls.filter(c=>c.path==='/api/jobs').at(-1).options.body);
  finishB(response({job_id:'jobB'},202));await b;
  const saved=JSON.parse(h.store.get('roomkind:job:A'));
  assert.equal(saved.body.upload_id,'photoB');assert.equal(saved.key,submitted.idempotency_key);assert.equal(saved.id,'jobB');
  assert.equal(h.calls.some(c=>c.path==='/api/jobs/jobA'),false);
  }finally{h.setDelay(null);h.close();await tick();}
});
test('actual app: old authentication_required after logout/new login keeps new account visible',async()=>{
  const h=await harness();let finish;
  h.setDelay(path=>path==='/api/me'?new Promise(r=>{finish=r;}):null);
  const old=h.element('refresh').onclick();await tick();h.setDelay(null);
  h.close();await tick();h.setOwner('B');h.element('email').value='B@example.test';h.element('password').value='test';
  h.element('auth-form').onsubmit({preventDefault(){},submitter:{value:'login'},currentTarget:h.element('auth-form')});
  for(let i=0;i<10;i++)await tick();
  finish(response({error:'authentication_required'},401));await old;
  assert.equal(h.element('workspace').hidden,false);assert.match(h.element('account-info').textContent,/B@example.test/);h.close();await tick();
});

test('actual app: delayed logout blocks login until cookie-clearing response settles',async()=>{
  const h=await harness();let finish;
  h.setDelay(path=>path==='/api/logout'?new Promise(r=>{finish=r;}):null);
  const button=new Element();h.element('auth-form').children=[button];
  h.element('auth-form').querySelectorAll=()=>[button];h.close();await tick();
  assert.equal(button.disabled,true);
  const event={preventDefault(){},submitter:{value:'login'},currentTarget:h.element('auth-form')};
  h.element('auth-form').onsubmit(event);await tick();assert.equal(h.calls.some(c=>c.path==='/api/login'),false);
  finish(response({ok:true}));await tick();assert.equal(button.disabled,false);
  h.setDelay(null);h.setOwner('B');h.element('auth-form').onsubmit(event);
  for(let i=0;i<10;i++)await tick();assert.match(h.element('account-info').textContent,/B@example.test/);h.close();await tick();
});

test('actual app: selection changes while reservation detail loads cannot render former selection',async()=>{
  const h=await harness();let finish;
  try {
    h.element('upload-choice').value='photoA';h.element('upload-choice').onchange();
    h.setDelay(path=>path==='/api/jobs'?Promise.resolve(response({job_id:'jobA'},202)):path==='/api/jobs/jobA'?new Promise(r=>{finish=r;}):null);
    const pending=h.element('generate').onclick();await tick();assert.equal(typeof finish,'function');
    h.element('upload-choice').value='photoB';h.element('upload-choice').onchange();
    finish(response({job:{job_id:'jobA',status:'queued',attempts:0}}));await pending;
    assert.equal(h.element('result').hidden,true);assert.equal(h.store.has('roomkind:job:A'),false);
  }finally{h.setDelay(null);h.close();await tick();}
});
