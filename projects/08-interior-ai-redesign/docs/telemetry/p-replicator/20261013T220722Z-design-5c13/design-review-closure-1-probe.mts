import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PgJobs} from '@n8/db/design';
import {requestCeiling} from '@n8/domain/design';
import {freshDb} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/tests/helpers/db.ts';
import {setup,live,clock} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/tests/design/fixtures.ts';
import {runOneJob} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/apps/worker/src/jobs.ts';
const db=await freshDb();
try {
 const f=await setup(db.pool),time=clock(),original=new PgJobs(db.pool,{aiMode:'live',aiLive:live},time);
 const preview=await original.preview(f.actor,f.project,1,f.input),job=await original.submit(f.actor,f.project,1,randomUUID(),f.input,preview.consentHash);
 const repriced={...live,inputRateMicroUsdPerMillion:100000,jobCapMicroUsd:1000,accountDayCapMicroUsd:2000,globalDayCapMicroUsd:4000};
 const changed=new PgJobs(db.pool,{aiMode:'live',aiLive:repriced},time),claimOriginal=changed.claim.bind(changed);let claim:any=null,proofs=0,posts=0;
 changed.claim=async(id:string)=>{claim=await claimOriginal(id);return claim;};
 assert.equal(await runOneJob({jobs:changed,workerId:'independent-reprice-probe',provider:{verifyBudget:async()=>{proofs++;},complete:async()=>{posts++;return{scene:f.scene,actualMicroUsd:0,usage:null};}}}),true);
 const ceiling=requestCeiling(preview.requestBody,repriced);assert.ok(ceiling>100);
 assert.equal(proofs,1);assert.equal(posts,0);assert.equal(await changed.markDispatched(claim),false);assert.equal(await changed.markDispatched(claim),false);await changed.rejectBeforeDispatch(claim);await changed.sweep();
 const saved=(await db.pool.query('SELECT state,error_code,request_dispatched_at,reserved_micro_usd::text reserved,actual_micro_usd::text actual,credit_state FROM job WHERE id=$1',[job.id])).rows[0];
 assert.deepEqual(saved,{state:'failed',error_code:'AI_CONFIG_CHANGED',request_dispatched_at:null,reserved:'100',actual:'0',credit_state:'released'});
 const ledgers=(await db.pool.query('SELECT scope,reserved_micro_usd::text reserved,settled_micro_usd::text settled FROM spend_budget ORDER BY scope')).rows;
 assert.deepEqual(ledgers,[{scope:'account',reserved:'0',settled:'0'},{scope:'global',reserved:'0',settled:'0'}]);
 const credit=(await db.pool.query('SELECT credits_available,credits_held FROM account WHERE id=$1',[f.actor])).rows[0];assert.deepEqual(credit,{credits_available:30,credits_held:0});
 console.log(JSON.stringify({result:'pass',reservedAtAdmission:100,recomputedCeiling:ceiling,proofs,posts,repeatedMark:false,saved,ledgers,credit}));
} finally {await db.close();}
