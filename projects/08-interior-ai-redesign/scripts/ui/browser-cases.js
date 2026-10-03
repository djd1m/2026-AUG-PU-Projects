// Owned software browser cases. Faults forward to the real app before delay/drop.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {drive} from './fixture-driver.js';
import {fixtureSignal} from '../payment-fixture.js';
let nextRequest=0;
export async function pace() {
  const now=Date.now(),slot=Math.max(now,nextRequest);nextRequest=slot+750;
  if(slot>now)await new Promise(r=>setTimeout(r,slot-now));
}
export async function paceContext(context) {
  await context.route('**/api/**',async route=>{await pace();await route.fallback();});
}
export async function delayedResponse(page,pattern,predicate=()=>true) {
  let signal,release,finish;const finished=new Promise(r=>{finish=r;});const reached=new Promise(r=>{signal=r;}),gate=new Promise(r=>{release=r;});
  let used=false;
  const handler=async route=>{
    if(used||!predicate(route.request()))return route.continue();used=true;
    await pace();const response=await route.fetch({timeout:10000});signal({response,request:route.request()});await gate;
    try {await route.fulfill({response});}catch { /* Original browser request can be aborted by scope reset. */ }finally{finish();}
  };
  await page.route(pattern,handler);
  return {reached,release,finished,close:async()=>{release();await page.unroute(pattern,handler);}};
}
export async function upload(page,config) {
  const ownerUploads=()=>page.evaluate(async()=>{
    const response=await fetch('/api/uploads',{credentials:'same-origin',cache:'no-store'});
    if(response.status!==200)throw new Error('owner_uploads_http_'+response.status);
    const body=await response.json();
    if(!Array.isArray(body.uploads))throw new Error('owner_uploads_missing');
    return body.uploads;
  });
  const before=await ownerUploads();
  const previous=[...before.map(u=>u.id),...await page.locator('#upload-choice option').evaluateAll(options=>options.map(o=>o.value))];
  await page.locator('#file').setInputFiles(resolve(config.storageDir,'upload.png'));
  const done=page.waitForResponse(r=>r.url().endsWith('/api/uploads')&&r.request().method()==='POST');
  await page.locator('#upload-form button').click();const response=await done;assert.equal(response.status(),201);
  // The app reads its fetch body and selects the saved UUID. CDP may already
  // have evicted that body; bind the fresh DOM selection to real owner metadata.
  await page.waitForFunction(previous=>{
    const id=document.querySelector('#upload-choice').value;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&!previous.includes(id);
  },previous);
  const id=await page.locator('#upload-choice').inputValue();
  assert.ok(!previous.includes(id),'upload selection must be fresh');
  const fresh=(await ownerUploads()).filter(u=>!before.some(old=>old.id===u.id));
  assert.equal(fresh.length,1,'owner must have exactly one new upload');
  assert.equal(fresh[0].id,id,'new owner upload must match DOM selection');
  assert.ok(Number.isInteger(fresh[0].width)&&fresh[0].width>0&&Number.isInteger(fresh[0].height)&&fresh[0].height>0,'upload dimensions required');
  assert.equal(fresh[0].mime,'image/webp');
  assert.ok(typeof fresh[0].created_at==='string'&&Number.isFinite(Date.parse(fresh[0].created_at)),'upload creation time required');
  return id;
}
async function login(page,email,password) {
  await page.locator('#email').fill(email);await page.locator('#password').fill(password);
  await page.locator('button[value=login]').click();
  await page.waitForFunction(email=>document.querySelector('#account-info').textContent.includes(email),email);
  await page.waitForFunction(()=>document.querySelector('#package-details').textContent.includes('900'));
}
export async function extendedCases({page,context,pool,config,check,request,reserve,width,otherEmail,password,partnerCode}) {
  const account=(await request(page,'/api/me')).body.account,uploadA=await upload(page,config);
  await check(`${width}: uncertain real reservation POST, reload and identical key/body recovery`,async()=>{
    let signal;const reached=new Promise(r=>{signal=r;});let used=false;
    const handler=async route=>{
      if(used||route.request().method()!=='POST')return route.continue();used=true;
      await pace();const response=await route.fetch();signal({body:route.request().postDataJSON(),result:await response.json()});await route.abort('failed');
    };
    await page.route('**/api/jobs',handler);
    try {
      await page.locator('#generate').click();const original=await reached;
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Состояние неизвестно'));
      await page.unroute('**/api/jobs',handler);await page.reload();
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Ответ прошлой генерации неизвестен'));
      const retried=page.waitForRequest(r=>r.url().endsWith('/api/jobs')&&r.method()==='POST');
      const id=await reserve(page);assert.deepEqual((await retried).postDataJSON(),original.body);assert.equal(id,original.result.job_id);
      await drive(pool,config,'fail');await page.locator('#resume').click();
      await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Не удалось'));
    }finally{await page.unroute('**/api/jobs',handler);}
  });
  const uploadB=await upload(page,config);
  await check(`${width}: R1 delayed A after B selection/submission; no overlap or stale A render`,async()=>{
    await page.locator('#upload-choice').selectOption(uploadA);
    const held=await delayedResponse(page,'**/api/jobs',r=>r.method()==='POST');
    try {
      await page.locator('#generate').click();const original=await held.reached;const a=(await original.response.json()).job_id;
      await page.locator('#upload-choice').selectOption(uploadB);
      assert.equal(await page.locator('#generate').isDisabled(),true);
      // Attempt the same DOM handler even while disabled: the independent pending flag must reject overlap.
      await page.evaluate(()=>document.querySelector('#generate').onclick());
      assert.equal(await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`roomkind:job:${id}`)),account.id),null);
      held.release();await page.waitForFunction(()=>!document.querySelector('#generate').disabled);
      assert.equal(await page.locator('#after').getAttribute('src'),null);
      const b=await reserve(page);await page.waitForFunction(({owner,id})=>JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`))?.id===id,{owner:account.id,id:b});const saved=await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`roomkind:job:${id}`)),account.id);
      assert.equal(saved.body.upload_id,uploadB);assert.equal(saved.id,b);assert.notEqual(saved.id,a);
      await drive(pool,config,'fail');await drive(pool,config,'fail');await page.locator('#resume').click();
      await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Не удалось'));
    }finally{await held.close();}
  });
  await check(`${width}: late reservation detail after selection change cannot render A`,async()=>{
    await page.locator('#upload-choice').selectOption(uploadA);
    const held=await delayedResponse(page,'**/api/jobs/*',r=>r.method()==='GET');
    try {
      await page.locator('#generate').click();await held.reached;
      await page.locator('#upload-choice').selectOption(uploadB);held.release();await held.finished;
      await page.waitForFunction(()=>!document.querySelector('#generate').disabled);
      assert.equal(await page.locator('#result').isVisible(),false);
      assert.equal(await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`roomkind:job:${id}`)),account.id),null);
      await drive(pool,config,'fail');
    }finally{await held.close();}
  });
  await check(`${width}: expired attribution cookie clears through actual authenticated POST`,async()=>{
    await page.locator('#clear-tracking').click();
    await page.waitForFunction(()=>document.querySelector('#attribution-status').textContent.includes('код: нет'));
    await page.locator('#partner-code').fill(partnerCode);await page.locator('#tracking-consent').check();await page.locator('#accept-tracking').click();
    await page.waitForFunction(()=>document.querySelector('#attribution-status').textContent.includes('источник: cookie'));
    await pool.query("UPDATE attribution SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=$1 AND source='cookie'",[account.id]);
    const state=await request(page,'/api/attribution/state','POST',{});assert.equal(state.status,200);assert.equal(state.body.partner_code,null);
    assert.equal((await context.cookies()).some(c=>c.name==='roomkind_attribution'),false);
    assert.equal((await request(page,'/api/me')).status,200);
  });
  await check(`${width}: historical software gallery >50 with real continuation and timeout screens`,async()=>{
    const ids=[];
    // Trusted owned DB historical failure seeds: no tickets, budget changes or GPU claims.
    for(let i=0;i<51;i++){
      const id=randomUUID();ids.push(id);
      await pool.query(`INSERT INTO job(id,account_id,upload_id,style,idempotency_key,request_hash,status,mode,reserved,failure_reason,created_at,queue_deadline,hard_deadline,finished_at)
        VALUES($1,$2,$3,'warm',$4,$5,'failed','fixture',false,$6,clock_timestamp()-($7*interval '1 minute'),clock_timestamp(),clock_timestamp(),clock_timestamp())`,
      [id,account.id,uploadB,'SYNTHETIC_UI_HISTORY_'+id,'0'.repeat(64),i===0?'queue_expired':'hard_deadline',i+1]);
    }
    await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#jobs').children.length===50);
    assert.equal(await page.locator('#next').isVisible(),true);await page.locator('#next').click();
    await page.waitForFunction(()=>document.querySelector('#jobs').children.length>50);
    const buttons=page.locator('#jobs button');
    // API continuation must contain distinct job IDs even when rendered text is identical.
    const first=(await request(page,'/api/jobs?limit=50')).body;
    const second=(await request(page,'/api/jobs?limit=50&before='+encodeURIComponent(first.next))).body;
    assert.equal(new Set([...first.jobs,...second.jobs].map(j=>j.job_id)).size,first.jobs.length+second.jobs.length);
    for(const [id,label] of [[ids[0],'Истекло время ожидания очереди'],[ids[1],'Истекло время выполнения']]) {
      const item=[...first.jobs,...second.jobs].findIndex(j=>j.job_id===id);assert.ok(item>=0);
      await buttons.nth(item).click();await page.waitForFunction(label=>document.querySelector('#job-status').textContent.includes(label),label);
      assert.equal(await page.locator('#source-preview').isVisible(),true);
    }
  });
  await check(`${width}: delete during pending real share response never restores private artifact`,async()=>{
    await page.locator('#upload-choice').selectOption(uploadB);await page.locator('[data-style=playful]').click();await reserve(page);
    await drive(pool,config,'complete');await page.locator('#resume').click();await page.locator('#comparison').waitFor({state:'visible'});
    const held=await delayedResponse(page,'**/share-attempt');
    try {
      await page.locator('#prepare-share').click();await held.reached;
      await page.locator('#delete-job').click();await page.locator('#result').waitFor({state:'hidden'});held.release();await held.finished;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await page.locator('#download').isVisible(),false);assert.equal(await page.locator('#native-share').isVisible(),false);
      assert.equal(await page.locator('#after').getAttribute('src'),null);
    }finally{await held.close();}
  });
  await check(`${width}: R4 delayed real authentication_required across logout/login`,async()=>{
    assert.equal((await request(page,'/api/logout','POST',{})).status,200);
    const held=await delayedResponse(page,'**/api/me');
    try {
      await page.locator('#refresh').click();assert.equal((await held.reached).response.status(),401);
      await page.locator('#logout').click();await login(page,otherEmail,password);held.release();await held.finished;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.waitForFunction(email=>document.querySelector('#account-info').textContent.includes(email),otherEmail);
      assert.equal(await page.locator('#workspace').isVisible(),true);
    }finally{await held.close();}
  });
  await check(`${width}: delayed logout response cannot overwrite new account`,async()=>{
    const held=await delayedResponse(page,'**/api/logout');
    try {
      await page.locator('#logout').click();await held.reached;
      assert.equal(await page.locator('button[value=login]').isDisabled(),true);held.release();await held.finished;
      await page.waitForFunction(()=>!document.querySelector('button[value=login]').disabled);await login(page,account.email,password);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await page.locator('#workspace').isVisible(),true);
      assert.match(await page.locator('#account-info').innerText(),new RegExp(account.email));
    }finally{await held.close();}
  });
}
export async function failureScreens({browser,pool,config,check,request,register,packagePurchase,width,password,run}) {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:844}}),page=await context.newPage();
  try {
    await paceContext(context);await register(page,`failure-${run}-${width}@example.test`,password);await upload(page,config);
    await check(`${width}: insufficient-credit screen from actual reservations`,async()=>{
      const u=await page.locator('#upload-choice').inputValue();
      assert.equal((await request(page,'/api/jobs','POST',{upload_id:u,style:'warm',idempotency_key:randomUUID()})).status,202);
      await page.locator('[data-style=minimal]').click();await page.locator('#generate').click();
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Недостаточно кредитов'));
    });
    const payment=await packagePurchase(page);
    await check(`${width}: budget-exhausted screen without weakened limits`,async()=>{
      const u=await page.locator('#upload-choice').inputValue();
      // Trial consumed one ticket; 19 more reaches unchanged account limit 20.
      for(let i=0;i<19;i++)assert.equal((await request(page,'/api/jobs','POST',{upload_id:u,style:'warm',idempotency_key:randomUUID()})).status,202);
      await page.locator('[data-style=playful]').click();await page.locator('#generate').click();
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Дневной бюджет'));
    });
    await check(`${width}: billing-hold screen from verified fixture refund`,async()=>{
      await fixtureSignal(pool,config,payment,'refund');await page.locator('#refresh').click();
      await page.waitForFunction(()=>document.querySelector('#account-info').textContent.includes('Ограничение оплаты'));
      assert.equal(await page.locator('#generate').isDisabled(),true);
      const u=await page.locator('#upload-choice').inputValue();
      const denied=await request(page,'/api/jobs','POST',{upload_id:u,style:'warm',idempotency_key:randomUUID()});assert.equal(denied.body.error,'billing_hold');
    });
  }finally{await context.close();}
}
