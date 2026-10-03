// Actual legacy case, helper and app handlers on local DOM/page seams; no runtime acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {clickAndWaitForHandler} from '../scripts/ui/browser-cases.js';

const source=await readFile(new URL('../scripts/ui/browser-cases.js',import.meta.url),'utf8');
const marker='await check(`${width}: delete during pending real share response never restores private artifact`,async()=>{';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
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
async function runCase(code=source,{deleteStatus=200,jobStatus=404,refreshStatus=200,reverse=false}={}) {
  const elements=new Map(),listeners=new Set(),waiters=[],events=[],store=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  element('styles').children=['warm','playful'].map(style=>Object.assign(new Element(),{dataset:{style}}));
  Object.assign(globalThis,{document:{getElementById:element,querySelector:s=>element(s.slice(1)),createElement:()=>new Element()},
    Option:class extends Element{constructor(label,value){super();this.textContent=label;this.value=value;}},
    sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    location:{href:'https://n8-ui.test/',origin:'https://n8-ui.test'}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  const gallery=deferred(),galleryEntered=deferred(),share=deferred();
  let armed=false,completed=false,deleted=false,generation,generateDone=false,resumeDone=false;
  const emit=(path,method,status)=>{
    const response={url:()=>`https://n8-ui.test${path}`,request:()=>({method:()=>method}),status:()=>status};
    events.push([path,method,status]);for(const listener of listeners)listener(response);
    for(const waiter of waiters)if(waiter.filter(response))waiter.resolve(response);
  };
  globalThis.fetch=async(path,options={})=>{
    const method=options.method??'GET';let body={},status=200;
    if(path==='/api/me')body={account:{id:'owner',email:'owner@example.test',credits:20,billing_hold:false}};
    else if(path==='/api/uploads')body={uploads:[{id:'photoB',width:640,height:480}]};
    else if(path.startsWith('/api/jobs?')) {
      body={jobs:[],next:null};
      if(armed&&!deleted){galleryEntered.resolve();await gallery.promise;}
    }else if(path==='/api/jobs'&&method==='POST'){body={job_id:'deleted'};status=202;}
    else if(path==='/api/jobs/deleted'&&method==='DELETE'){deleted=true;status=deleteStatus;}
    else if(path==='/api/jobs/deleted')body={job:{job_id:'deleted',upload_id:'photoB',status:completed?'succeeded':'queued',mode:'fixture',quality:'unverified',attempts:1}};
    else if(path.endsWith('/publication')) {
      assert.equal(element('comparison').hidden,false,'comparison appears before resume handler completion');
      assert.equal(resumeDone,false);assert.equal(listeners.size,0,'observer must wait for actual resume publication tail');
      await tick();body={published:false,available:false};
    }else if(path==='/api/payments/config')body={credits:20,amount_minor:90000};
    if(deleted&&method==='GET'&&path==='/api/me')status=refreshStatus;
    // Response-path seam exercises the unchanged ordered oracle against a bad order.
    const emitted=reverse&&deleted?(path==='/api/uploads'?'/api/me':path==='/api/me'?'/api/uploads':path):path;
    emit(emitted,method,status);
    return {ok:status<400,status,json:async()=>body};
  };
  await import('../web/public/app.js?delete-order='+crypto.randomUUID());
  for(let i=0;i<8;i++)await tick();events.length=0;armed=true;
  const originals={resume:element('resume').onclick,delete:element('delete-job').onclick};
  element('resume').onclick=function(event){const p=originals.resume.call(this,event);return p.then(()=>{resumeDone=true;});};
  const resumeHandler=element('resume').onclick;
  element('prepare-share').onclick=()=>share.promise;
  const page={
    locator:selector=>{
      const el=element(selector.slice(1));return {
        selectOption:async value=>{el.value=value;el.onchange();},
        click:async()=>{el.onclick?.call(el,{type:'click'});},
        evaluateHandle:async fn=>{const state=fn(el);return {evaluate:async fn=>fn(state),dispose:async()=>{}};},
        waitFor:async({state})=>{for(let i=0;i<10&&el.hidden!==(state==='hidden');i++)await tick();assert.equal(el.hidden,state==='hidden');},
        isVisible:async()=>!el.hidden,getAttribute:async key=>el.attributes[key]??null
      };
    },
    waitForFunction:async fn=>{
      assert.equal(generateDone,false,'test must delay the actual generate gallery tail');
      assert.equal(element('generate').disabled,true);assert.equal(listeners.size,0);
      gallery.resolve();await generation;assert.equal(fn(),true);
    },
    waitForResponse:filter=>{const d=deferred();waiters.push({filter,resolve:d.resolve});return d.promise;},
    on:(name,listener)=>{assert.equal(name,'response');listeners.add(listener);gallery.resolve();},
    off:(name,listener)=>listeners.delete(listener),evaluate:async()=>{await tick();}
  };
  const start=code.indexOf(marker)+marker.length,end=code.indexOf('\n  });',start);
  assert.ok(start>=marker.length&&end>start,'actual case extraction boundary');
  const fn=runInNewContext('(async()=>{'+code.slice(start,end)+'})',{
    assert,URL,document:globalThis.document,page,uploadB:'photoB',pool:{},config:{},clickAndWaitForHandler,
    reserve:async()=>{generation=element('generate').onclick().then(()=>{generateDone=true;});await galleryEntered.promise;return 'deleted';},
    drive:async()=>{completed=true;},
    delayedResponse:async()=>({reached:Promise.resolve(),finished:share.promise,release:()=>share.resolve(),close:async()=>share.resolve()}),
    request:async()=>({status:jobStatus})
  });
  let error;
  try {await fn();}catch(e){error=e;}finally{gallery.resolve();share.resolve();await generation;await element('logout').onclick();await tick();}
  assert.equal(element('resume').onclick,resumeHandler,'real helper restores resume handler');
  assert.equal(element('delete-job').onclick,originals.delete,'real helper restores delete handler');
  assert.equal(listeners.size,0,'observer cleanup');
  return {error,events,generateDone,resumeDone};
}
test('actual legacy deletion waits delayed generate gallery and resume promise, preserving DELETE200/three GET200/404 oracle',async()=>{
  const result=await runCase();assert.equal(result.error,undefined);assert.equal(result.generateDone,true);assert.equal(result.resumeDone,true);
  const at=result.events.findIndex(e=>e[1]==='DELETE');
  assert.deepEqual(result.events.slice(at,at+4),[
    ['/api/jobs/deleted','DELETE',200],['/api/uploads','GET',200],['/api/me','GET',200],['/api/jobs?limit=50','GET',200]
  ]);
});
test('original predecessor race reproduces extra prior gallery before unchanged three refreshes',async()=>{
  const original=source.replace("    // reserve returns before generate's balance/gallery tail; its finally clears disabled.\n    await page.waitForFunction(()=>!document.querySelector('#generate').disabled);\n",'')
    .replace("await clickAndWaitForHandler(page,'#resume');await page.locator('#comparison')","await page.locator('#resume').click();await page.locator('#comparison')");
  assert.notEqual(original,source);const result=await runCase(original);
  assert.equal(result.error?.code,'ERR_ASSERTION',String(result.error));assert.match(result.error.message,/^all delete refreshes must succeed/);
  assert.deepEqual(Array.from(result.error.actual,row=>Array.from(row)),[
    ['/api/jobs?limit=50',200],['/api/uploads',200],['/api/me',200],['/api/jobs?limit=50',200]
  ]);
});
test('unchanged deletion oracle rejects failed DELETE, failed refresh, wrong order and missing owner404',async()=>{
  for(const options of [{deleteStatus:500},{refreshStatus:500},{reverse:true},{jobStatus:200}]) {
    assert.equal((await runCase(source,options)).error?.code,'ERR_ASSERTION');
  }
});
