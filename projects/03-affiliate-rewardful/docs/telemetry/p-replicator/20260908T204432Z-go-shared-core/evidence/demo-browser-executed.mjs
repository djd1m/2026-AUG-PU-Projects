import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { open,wd,js,element,screenshot,noOverflow,until } from '/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/tests/helpers/browser.mjs';
const dir='.runtime/demo-guides';await mkdir(dir,{recursive:true});const checks=[];
const pages=[['index','http://127.0.0.1:13031/demos/index.html'],...['a','b','c','d'].map((v,i)=>[v,`http://127.0.0.1:${13031+i}/demo.html`])];
for(const [name,url] of pages){
 const response=await fetch(url);assert.equal(response.status,200);
 await open(url);assert.ok(await js('return !!document.querySelector("h1")'));
 const links=await js('return [...document.querySelectorAll("a")].map(a=>a.href)');
 for(const link of links){if(new URL(link).hostname==='127.0.0.1')assert.equal((await fetch(link)).status,200,link);else assert.ok(link.startsWith('https://github.com/djd1m/2026-AUG-PU-Projects/blob/'));}
 checks.push({page:name,width:1440,...await noOverflow(),links:links.length});await screenshot(dir,name+'-desktop');
 await open(new URL('/mobile.html',url).href);await js('document.querySelector("#mobile-frame").src=arguments[0]',url);
 await wd('/frame',{id:await element('#mobile-frame')});await until('return location.href === '+JSON.stringify(url)+' && document.readyState === "complete" && !!document.querySelector("main h1")');
 assert.equal(await js('return innerWidth'),390);checks.push({page:name,width:390,...await noOverflow()});await screenshot(dir,name+'-mobile');
}
await writeFile(dir+'/browser-summary.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'5 actual served HTML pages, desktop1440/mobile390, headings/overflow/runtime links; content reviewed against E2E flows'},null,2)+'\n');console.log(JSON.stringify(checks));
