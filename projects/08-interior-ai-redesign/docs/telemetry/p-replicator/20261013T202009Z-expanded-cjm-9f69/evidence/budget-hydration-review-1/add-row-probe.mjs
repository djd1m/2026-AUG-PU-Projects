import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const [imageRevision,nextBuild]=process.argv.slice(2);assert(imageRevision&&nextBuild);
const evidence=new URL('./',import.meta.url),project=new URL('../../../../../../',import.meta.url);
const fixture=JSON.parse(await readFile(new URL('.runtime/ui-review-owner-2.json',project),'utf8'));
const origin=fixture.origin;assert.equal(new URL(origin).hostname,'127.0.0.1');
const output=new URL('add-row-result.json',evidence);
try{await access(output);throw new Error('Fresh result required');}catch(error){if(error.code!=='ENOENT')throw error;}
const source=new URL('apps/web/src/components/BudgetPanel.tsx',project);
const sourceSha=createHash('sha256').update(await readFile(source)).digest('hex');
const ready=await fetch(origin+'/health/ready');assert.equal(ready.status,200);
await writeFile(new URL('add-row-preflight.json',evidence),JSON.stringify({status:'ready',at:new Date().toISOString(),imageRevision,nextBuild,source:fileURLToPath(source),sourceSha,healthHTTP:200,fixture:'Existing private synthetic owner; same project as parent RED/GREEN',command:'node add-row-probe.mjs <imageRevision> <nextBuild>',effects:'Login session and GET reads only; no form submit; blocked external traffic',e2eClaim:null},null,2)+'\n');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext(),page=await context.newPage();
let release,markRequested;const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{markRequested=resolve;});
const startedAt=new Date().toISOString(),outbound=[],mutations=[];
try{
 const login=await context.request.post(origin+'/api/auth/login',{headers:{origin},data:{email:fixture.email,password:fixture.password}});assert.equal(login.status(),200);
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin&&!['blob:','data:'].includes(url.protocol)){outbound.push(url.origin);return route.abort();}if(request.method()!=='GET'){mutations.push(url.pathname);return route.abort();}if(url.pathname===`/api/projects/${fixture.projectId}/budgets`){markRequested();await gate;}return route.continue();});
 await page.goto(origin+`/dashboard/${fixture.projectId}`);
 await page.getByRole('tab',{name:'05 Смета',exact:true}).press('Enter');await requested;
 const services=page.locator('fieldset.cost-scope').first();
 assert.equal(await services.getByLabel('Название расхода',{exact:true}).count(),1);
 await services.getByRole('button',{name:'Добавить расход',exact:true}).press('Enter');
 assert.equal(await services.getByLabel('Название расхода',{exact:true}).count(),2);
 release();await page.locator('.budget-summary').waitFor();
 const names=await services.getByLabel('Название расхода',{exact:true}).evaluateAll(inputs=>inputs.map(input=>input.value));
 assert.deepEqual(names,['Работы','Дополнительный расход']);
 assert.equal(await services.getByLabel(/^Статус расхода/).first().inputValue(),'unknown');
 assert.equal(await page.getByLabel('Лимит ремонта, ₽',{exact:true}).inputValue(),'');
 assert.deepEqual(outbound,[]);assert.deepEqual(mutations,[]);
 await page.screenshot({path:fileURLToPath(new URL('add-row-preserved.png',evidence)),fullPage:true});
 await writeFile(output,JSON.stringify({status:'passed',testTitle:'SC-US-023-1 delayed saved-budget load preserves Add expense button action without any field change',startedAt,finishedAt:new Date().toISOString(),imageRevision,nextBuild,sourceSha,observed:{serviceNames:names,kind:'unknown',limit:''},outbound,productMutations:mutations.length,liveCalls:0},null,2)+'\n');
 console.log('PASS delayed hydration preserves Add expense action without field changes');
}catch(error){await writeFile(output,JSON.stringify({status:'failed',startedAt,finishedAt:new Date().toISOString(),imageRevision,nextBuild,error:String(error).replaceAll(fixture.password,'[redacted]'),outbound,mutations},null,2)+'\n');process.exitCode=1;console.error('Add-row probe failed; inspect owned result artifact.');}
finally{release();await context.close();await browser.close();}
