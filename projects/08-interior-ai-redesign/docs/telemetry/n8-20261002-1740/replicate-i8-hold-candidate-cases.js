// Actual DOM/API/private output, mock hosted HTTP only. Parent executes after review.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {upload,paceContext,clickAndWaitForHandler,login} from './browser-cases.js';
import {createHostedFixture,responseGate} from './replicate-fixture.js';
import {createJobs} from '../../web/jobs.js';
import {cleanupDeleted} from '../maintenance.js';
import {sha,canonical} from '../../web/generation.js';

// Use the app's consumed fetch + stored intent rather than a possibly evicted CDP body.
async function reserveHosted(page,owner) {
  const previous=await page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`))?.id,owner);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/jobs')&&r.request().method()==='POST');
  await page.locator('#generate').click();assert.equal((await response).status(),202);
  await page.waitForFunction(({owner,previous})=>{
    const value=JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`));return value?.id&&value.id!==previous;
  },{owner,previous});
  return page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`)).id,owner);
}
async function privateCompletion(pool,config,id) {
  const j=(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
  assert.equal(j.status,'succeeded');assert.equal(j.mode,'replicate');assert.equal(j.quality,'unverified');
  const rows=(await pool.query('SELECT canonical_evidence,evidence_sha FROM generation_evidence WHERE job_id=$1',[id])).rows;
  assert.equal(rows.length,1);const e=rows[0].canonical_evidence;
  assert.equal(sha(canonical(e)),rows[0].evidence_sha);
  for(const [folder,key] of [['outputs','output_sha'],['depths','depth_sha'],['configs','config_sha']])
    assert.equal(sha(await readFile(join(config.storageDir,folder,j.output_key))),e[key]);
  for(const key of ['hardware','warm','inference_ms','billing_actual_microusd'])assert.equal(e[key],null);
  assert.equal(e.quality,'unverified');return {job_id:id,evidence_sha:rows[0].evidence_sha,output_sha:e.output_sha,
    software_fixture:true,provider_metrics:null,quality:'unverified'};
}
// Both flights use real claims/authorization; the account hold is permanent.
export async function heldPair({fixture,afterId,reserveBefore,hold,beforeCheck,afterCheck}) {
  const gate=responseGate();let after,before;
  try {
    const beforeId=await reserveBefore(); // Both reservations precede permanent hold.
    after=await fixture.start(afterId,{gate});
    await Promise.race([gate.entered,after.done.then(result=>{throw new Error('worker_ended_before_gate:'+result.error);})]);
    assert.equal(after.counts().post,1); // Actual POST follows committed final authorization.
    before=await fixture.start(beforeId,{beforeRun:hold});
    const beforeResult=await before.done;
    gate.release(); // Release inside the transport's 5s bound, before any paced DOM work.
    const afterResult=await after.done;
    await beforeCheck(beforeId,before,beforeResult);
    await afterCheck(afterId,after,afterResult);
  } finally {
    gate.release();before?.cancel();after?.cancel();
    await Promise.all([before?.done,after?.done]);
  }
}
export async function hostedCases({browser,pool,config,check,request,packagePurchase,other,width,password,origin,ownerAccount,out}) {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
  await paceContext(context);const page=await context.newPage(),errors=[],evidence=[];
  page.on('pageerror',e=>errors.push(e.message));
  let active;
  try {
    await page.goto(origin);await page.locator('#auth').waitFor({state:'visible'});
    await login(page,ownerAccount.email,password);
    const authenticated=await request(page,'/api/me');
    assert.equal(authenticated.status,200);
    assert.equal(authenticated.body.account.id,ownerAccount.id);
    assert.equal(authenticated.body.account.email,ownerAccount.email);
    await packagePurchase(page);
    const owner=authenticated.body.account.id,fixture=await createHostedFixture(pool,config);
    const reserve=()=>reserveHosted(page,owner);
    const finish=async id=>{await page.locator('#resume').click();await page.locator('#comparison').waitFor({state:'visible'});
      assert.match(await page.locator('#after').getAttribute('src'),new RegExp(id));};
    await upload(page,config);await page.locator('[data-style=warm]').click();
    const id=await reserve();
    await check(`${width}: hosted mock actual worker/private comparison/gallery/unverified refusal`,async()=>{
      active=await fixture.start(id);assert.deepEqual(await active.done,{completed:true,error:null});
      assert.deepEqual(active.counts(),{api:2,post:1,get:1,delivery:2});
      evidence.push({...await privateCompletion(pool,config,id),mock_calls:active.counts()});await page.reload();
      await page.locator('#workspace').waitFor({state:'visible'});await finish(id);
      assert.match(await page.locator('#quality-label').innerText(),/unverified/);
      assert.equal(await page.locator('#publish-consent').isDisabled(),true);
      assert.equal(await page.locator('#publish').isDisabled(),true);
      const denied=await request(page,`/api/jobs/${id}/publication`,'POST',{publish:true,style:'warm',
        source_context:'Synthetic room software test',description:'Synthetic hosted mock checks software only; geometry has not been accepted.'});
      assert.equal(denied.status,404);
      await page.locator('#refresh').click();
      const button=page.locator('#jobs li').filter({has:page.locator(`img[src="/api/jobs/${id}/result"]`)}).locator('button');
      await button.click();await finish(id);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await other.evaluate(async id=>(await fetch(`/api/jobs/${id}/result`)).status,id),404);
      assert.equal((await request(other,`/api/jobs/${id}`)).status,404);
      await page.screenshot({path:resolve(out,`hosted-${width}.png`),fullPage:true});
    });
    await check(`${width}: hosted missing/disabled configuration zero HTTP and no DOM result`,async()=>{
      // A new upload keeps old successful results distinct from this queued reservation.
      await upload(page,config);const pending=await reserve();
      for(const envPatch of [{REPLICATE_API_TOKEN:undefined},{WORKER_MODE:'disabled'}]) {
        active=await fixture.start(pending,{envPatch});const result=await active.done;
        assert.equal(result.completed,false);assert.match(result.error,/replicate_config_denied|worker_mode_denied/);
        assert.deepEqual(active.counts(),{api:0,post:0,get:0,delivery:0});
        evidence.push({job_id:pending,scenario:envPatch.WORKER_MODE?'disabled':'missing-token',mock_calls:active.counts(),attached:false});
        const job=(await request(page,`/api/jobs/${pending}`)).body.job;
        assert.equal(job.status,'queued');
        assert.equal(await page.evaluate(async id=>(await fetch(`/api/jobs/${id}/result`)).status,pending),404);
        await page.locator('#resume').click();assert.equal(await page.locator('#comparison').isHidden(),true);
        assert.equal(await page.locator('#publish').isDisabled(),true);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_evidence WHERE job_id=$1',[pending])).rows[0].n,0);
      }
      await page.locator('#delete-job').click();await page.locator('#result').waitFor({state:'hidden'});
    });
    await check(`${width}: hosted deletion during held remote response fences completion/cleanup`,async()=>{
      await upload(page,config);const deleted=await reserve(),gate=responseGate();
      const folders=['outputs','depths','configs'];
      const before=await Promise.all(folders.map(folder=>readdir(join(config.storageDir,folder))));
      try {
        active=await fixture.start(deleted,{gate});
        await Promise.race([gate.entered,active.done.then(result=>{throw new Error('worker_ended_before_gate:'+result.error);})]);
        assert.equal(active.counts().post,1);
        const deletion=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/jobs/${deleted}`&&r.request().method()==='DELETE');
        const [deletedResponse]=await Promise.all([deletion,clickAndWaitForHandler(page,'#delete-job')]);
        assert.equal(deletedResponse.status(),200);
        await page.locator('#result').waitFor({state:'hidden'});
        assert.equal((await request(page,`/api/jobs/${deleted}`)).status,404);gate.release();
        assert.equal((await active.done).completed,false);
        assert.equal((await request(page,`/api/jobs/${deleted}`)).status,404);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_evidence WHERE job_id=$1',[deleted])).rows[0].n,0);
        const releases=async()=>(await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE reference=$1 AND kind='release'",[deleted])).rows[0].n;
        assert.equal(await releases(),1);assert.equal(await createJobs(pool,config).fail(deleted,active.claim.fence,{retryable:false}),false);
        assert.equal(await releases(),1);await cleanupDeleted(pool,config.storageDir);
        const after=await Promise.all(folders.map(folder=>readdir(join(config.storageDir,folder))));
        for(let i=0;i<folders.length;i++)assert.ok(after[i].every(key=>before[i].includes(key)),'deleted worker must create no private artifact');
        assert.equal(active.counts().delivery,0);
        evidence.push({job_id:deleted,scenario:'deleted-during-response',mock_calls:active.counts(),attached:false,release_count:await releases()});
      } finally {gate.release();active?.cancel();await active?.done;}
    });
    // Complete every unheld scenario before the final paired hold. No hold reset.
    await upload(page,config);const authorized=await reserve();
    await heldPair({fixture,afterId:authorized,
      reserveBefore:async()=>{await upload(page,config);return await reserve();},
      hold:()=>pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[owner]),
      beforeCheck:async(held,flight,result)=>{
        await check(`${width}: hosted hold before send zero HTTP/one release`,async()=>{
          assert.equal(result.completed,false);assert.ok(result.error);
          assert.deepEqual(flight.counts(),{api:0,post:0,get:0,delivery:0});
          evidence.push({job_id:held,scenario:'hold-before-send',mock_calls:flight.counts(),attached:false});
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE reference=$1 AND kind='release'",[held])).rows[0].n,1);
          await page.locator('#resume').click();await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Исходное фото сохранено'));
          assert.equal(await page.locator('#comparison').isHidden(),true);
        });
      },
      afterCheck:async(held,flight,result)=>{
        await check(`${width}: hosted hold after committed authorization still completes privately`,async()=>{
          assert.deepEqual(result,{completed:true,error:null});
          assert.deepEqual(flight.counts(),{api:2,post:1,get:1,delivery:2});
          evidence.push({...await privateCompletion(pool,config,held),scenario:'hold-after-send',mock_calls:flight.counts()});
          await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
          const button=page.locator('#jobs li').filter({has:page.locator(`img[src="/api/jobs/${held}/result"]`)}).locator('button');
          await button.click();await finish(held);
          assert.match(await page.locator('#quality-label').innerText(),/unverified/);
          assert.equal(await page.locator('#publish-consent').isDisabled(),true);
          assert.equal(await page.locator('#publish').isDisabled(),true);
          assert.equal((await request(page,`/api/jobs/${held}/publication`,'POST',{publish:true,style:'warm',source_context:'Synthetic held room',
            description:'Synthetic held software result, no accepted provider geometry.'})).status,404);
        });
      }
    });
    assert.deepEqual(errors,[]);return evidence;
  } finally {active?.cancel();await active?.done;await context.close();}
}
