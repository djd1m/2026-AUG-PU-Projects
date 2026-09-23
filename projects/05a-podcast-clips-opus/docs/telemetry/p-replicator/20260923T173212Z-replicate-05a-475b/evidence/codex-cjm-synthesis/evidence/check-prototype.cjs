// Local contract/behavior checks with a minimal DOM adapter. Not a browser/layout test.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const file=process.argv[2]||'docs/CJM_Variants.html';
const html=fs.readFileSync(file,'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
assert(!/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/i.test(html),'offline dependencies');
assert(html.includes(':root:not([data-theme="light"])')&&html.includes(':root[data-theme="dark"]'));
assert(html.includes('padding:20px 16px'),'mobile side gutters');
assert(html.includes('aspect-ratio:9/16'));
class Element{
 constructor(){this.value='';this.checked=true;this.disabled=false;this.textContent='';this.innerHTML='';this.dataset={};this.listeners={};this.children=[];this.classList={add(){},remove(){}}}
 addEventListener(k,f){this.listeners[k]=f}setAttribute(k,v){this[k]=v}appendChild(e){this.children.push(e)}focus(){}select(){}scrollIntoView(){}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
const tabs=['A','B','C','D'].map(k=>{const e=get('tab-'+k);e.dataset.key=k;return e});
const words=Array.from({length:5},()=>new Element());
let interval,clipboard='';
const document={getElementById:get,querySelectorAll:s=>s==='[role=tab]'?tabs:words,querySelector:()=>tabs[0],createElement:()=>new Element(),documentElement:{dataset:{}}};
const context=vm.createContext({document,navigator:{clipboard:{writeText:async t=>{clipboard=t}}},URL,setInterval:f=>{interval=f;return 1},clearInterval:()=>{},console});
vm.runInContext(script,context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 assert.strictEqual((get('tabs').innerHTML.match(/role="tab"/g)||[]).length,4);
 for(const key of ['A','B','C','D'])for(let i=0;i<6;i++){
  run(`current='${key}';step=${i};mixed=false;render()`);
  assert(get('screen').innerHTML.length>100);
  assert(get('stageTitle').textContent.includes(`${i+1} / 6`));
  if(i===3)for(const x of ['data-action="export"','Хук','Завершённость мысли','Длина','watermark'])assert(get('screen').innerHTML.includes(x),'Aha contract: '+x);
  if(i===4)assert(get('screen').innerHTML.indexOf('<table>')<get('screen').innerHTML.indexOf('id="minutes"'));
 }
 run("current='B';step=0;mixed=false;render()");get('next').onclick();assert(get('stageTitle').textContent.includes('2 / 6'));get('back').onclick();assert(get('stageTitle').textContent.includes('1 / 6'));
 get('overlayToggle').checked=false;get('overlayToggle').onchange();assert(get('overlay').hidden);
 get('theme').onchange({target:{value:'dark'}});assert.equal(document.documentElement.dataset.theme,'dark');
 get('theme').onchange({target:{value:'light'}});assert.equal(document.documentElement.dataset.theme,'light');
 get('theme').onchange({target:{value:'auto'}});assert.equal(document.documentElement.dataset.theme,undefined);
 run("mix[3]='A';mix[4]='C';mix[5]='B';choice()");assert(get('choiceText').value.includes('Aha от A, paywall от C, loop от B'));
 get('preview').onclick();assert(get('modeLabel').textContent.includes('Свой вариант'));
 run('step=5;render()');assert(get('screen').innerHTML.includes('copyBadge'));assert.equal(get('loopLabel').textContent,'badge');
 await get('copyChoice').onclick();assert(clipboard.includes('Aha от A, paywall от C, loop от B'));
 const click=async action=>{const b=new Element();b.dataset.action=action;await get('screen').listeners.click({target:{closest:()=>b}});return b};
 run("mixed=false;current='A';step=3;render()");await click('export');assert(get('status').textContent.includes('Сначала посмотрите'));
 await click('play');for(let i=0;i<5;i++)interval();await click('export');assert(get('status').textContent.includes('ничего не публикует'));
 run('step=4;render();updateCost(60)');assert(get('cost').textContent.includes('40–100'));run('updateCost(-1)');assert.equal(get('minutes').value,0);
 get('partnerCode').listeners.input({target:{value:'<script>demo</script>'}});run('render()');assert(get('screen').innerHTML.includes('&lt;script&gt;demo&lt;/script&gt;'));
 run('step=5;render()');get('postUrl').value='javascript:alert(1)';await click('saveUrl');assert(get('status').textContent.includes('корректную ссылку'));
 get('postUrl').value='https://example.test/post';await click('saveUrl');assert(get('status').textContent.includes('не прибавилось'));
 run('navigator.clipboard=null');await click('copyCode');assert.equal(get('status').children.at(-1).value,'ДЕМО-КОД-A');
 console.log('PASS: JS syntax; offline assets; structural theme/mobile/9:16 guards; 24 screen renders; navigation; overlay; theme handlers; hybrid preview; clipboard success/fallback; Aha playback gate; calculator; escaping; URL validation. DOM adapter only; layout/browser unverified.');
})().catch(e=>{console.error(e);process.exitCode=1});
