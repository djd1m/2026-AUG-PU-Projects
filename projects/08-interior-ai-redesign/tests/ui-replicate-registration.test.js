import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=name=>readFile(new URL(`../scripts/ui/${name}`,import.meta.url),'utf8');
const [browser,cases,hosted]=await Promise.all(['browser.js','browser-cases.js','replicate-cases.js'].map(read));

// Execute actual hosted authentication and shared DOM login; no browser/PG/network.
async function authenticate(account={id:'main-390',email:'owner-390@example.test'}) {
  const events=[],ownerAccount={id:'main-390',email:'owner-390@example.test'};
  const page={on:()=>{},goto:async url=>events.push(['goto',url]),
    locator:selector=>({waitFor:async()=>events.push(['visible',selector]),
      fill:async value=>events.push(['fill',selector,value]),
      click:async()=>events.push(['click',selector])}),
    waitForFunction:async()=>{}};
  const context={newPage:async()=>page,close:async()=>events.push(['close'])};
  const loginStart=cases.indexOf('export async function login('),loginEnd=cases.indexOf('export async function extendedCases');
  const start=hosted.indexOf('export async function hostedCases('),end=hosted.indexOf('    const reserve=()=>reserveHosted');
  assert.ok(loginStart>=0&&loginEnd>loginStart&&start>=0&&end>start);
  const fn=runInNewContext(cases.slice(loginStart,loginEnd).replace('export ','')+
    hosted.slice(start,end).replace('export ','')+'return owner; } finally {await context.close();}}\nhostedCases',{
    assert,paceContext:async()=>events.push(['pace']),
    createHostedFixture:async()=>{events.push(['fixture']);return {};}
  });
  const run=()=>fn({browser:{newContext:async options=>{events.push(['context',options.viewport.width]);return context;}},
    pool:{},config:{},width:390,password:'test-only-password',origin:'https://test.invalid',ownerAccount,
    request:async(p,path)=>{assert.equal(p,page);assert.equal(path,'/api/me');events.push(['me']);return {status:200,body:{account}};},
    packagePurchase:async()=>events.push(['purchase'])});
  return {run,events};
}

test('fresh hosted context logs in as existing viewport owner before fixture purchase',async()=>{
  const {run,events}=await authenticate();assert.equal(await run(),'main-390');
  assert.deepEqual(events,[['context',390],['pace'],['goto','https://test.invalid'],['visible','#auth'],
    ['fill','#email','owner-390@example.test'],['fill','#password','test-only-password'],
    ['click','button[value=login]'],['me'],['purchase'],['fixture'],['close']]);
});

test('wrong owner ID or email rejects before purchase and closes fresh context',async()=>{
  for(const account of [{id:'other',email:'owner-390@example.test'},{id:'main-390',email:'other@example.test'}]) {
    const {run,events}=await authenticate(account);await assert.rejects(run,{code:'ERR_ASSERTION'});
    assert.equal(events.some(([name])=>name==='purchase'||name==='fixture'),false);
    assert.deepEqual(events.at(-1),['close']);
  }
});

test('source budget is five registrations and eight unique legacy plus five hosted reservations per owner',()=>{
  assert.match(browser,/for\(const width of \[1440,390\]\)/);
  assert.equal((browser.match(/await register\(/g)||[]).length,2); // other once + owner per viewport
  const failure=cases.slice(cases.indexOf('export async function failureScreens'));
  assert.equal((failure.match(/await register\(/g)||[]).length,1); // failure per viewport
  assert.doesNotMatch(hosted,/\bregister\s*\(/);
  assert.equal(1+2*(1+1),5);
  assert.ok(browser.indexOf('await extendedCases(')<browser.indexOf('await hostedCases('));
  assert.match(browser,/hostedCases\(\{[^\n]*other,width,password,origin,ownerAccount,out/);
  assert.match(hosted,/request\(other,`\/api\/jobs\/\$\{id\}`\)\)\.status,404/);
  const extended=cases.slice(cases.indexOf('export async function extendedCases'),cases.indexOf('export async function failureScreens'));
  const baseline=(browser.match(/await reserve\(page\)/g)||[]).length;
  const direct=(extended.match(/await page\.locator\('#generate'\)\.click\(\)/g)||[]).length;
  const helper=(extended.match(/await reserve\(page\)/g)||[]).length;
  assert.equal(baseline,3);assert.equal(direct,3);assert.equal(helper,3);
  // One helper retries the lost response with the original body/key and same job ID.
  assert.match(extended,/assert\.deepEqual\(\(await retried\)\.postDataJSON\(\),original\.body\);assert\.equal\(id,original\.result\.job_id\)/);
  const legacy=baseline+direct+helper-1;
  const added=(hosted.match(/await reserve\(\)/g)||[]).length;
  assert.equal(legacy,8);assert.equal(added,5);assert.equal(legacy+added,13);assert.ok(legacy+added<20);
});
