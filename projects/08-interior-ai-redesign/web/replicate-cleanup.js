import { performance } from 'node:perf_hooks';
import { transaction } from './db.js';
import { lockSubmission,observePredictionLocked } from './provider-submissions.js';
import { createReplicateBudget,createReplicateTransport,REPLICATE_MODEL,REPLICATE_VERSION,
  REPLICATE_CONTRACT_SHA } from './replicate.js';
import { replicateCleanupEnabled,replicateTransportConfig } from './replicate-worker-config.js';

const TERMINAL=['succeeded','failed','canceled','aborted'];
const ID=/^[a-zA-Z0-9_-]{1,128}(?![\s\S])/;
const IDENTITY=['id','job_id','provider','model','version','contract_sha','prediction_id','request_sha',
  'attempt_number','attempt_ticket_id','submission_fence'];
const time=value=>value===null||value===undefined?NaN:new Date(value).getTime();
const sameTime=(a,b)=>a===b||time(a)===time(b);
const counts=()=>({scanned:0,claimed:0,actions:0,done:0,needed:0,unresolved:0,stale:0,errors:0});
const deny=()=>{throw new Error('replicate_cleanup_denied');};
const retained=(s,now)=>Number.isFinite(time(s.submitting_at))&&time(s.submitting_at)<=+now&&
  +now<time(s.submitting_at)+3600000;
function disposition(s,now) {
  if(!retained(s,now)||s.identity_conflict_at||!s.prediction_id||!ID.test(s.prediction_id)||
    s.provider!=='replicate'||s.model!==REPLICATE_MODEL||s.version!==REPLICATE_VERSION||
    s.contract_sha!==REPLICATE_CONTRACT_SHA||!Number.isFinite(time(s.attempt_deadline)))return 'unresolved';
  return TERMINAL.includes(s.provider_status)?'done':null;
}

// Only pass/counts are public. Claim handles, original-deadline cleanup budgets and
// observation authority never escape to worker create/poll/import consumers.
export function createReplicateCleanup(pool,config,{trustedClock,monotonicNow,transportOptions}={}) {
  if((trustedClock!==undefined||monotonicNow!==undefined)&&config.runtime!=='test')deny();
  monotonicNow??=()=>performance.now();
  if(typeof monotonicNow!=='function'||(trustedClock!==undefined&&typeof trustedClock!=='function'))deny();
  const enabled=replicateCleanupEnabled(config);
  const transport=enabled?createReplicateTransport(replicateTransportConfig(config),transportOptions):null;
  async function clock(c) {
    const now=trustedClock?new Date(await trustedClock()):(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if(!Number.isFinite(+now))deny();return now;
  }
  async function ordered(candidate,action) {
    return transaction(pool,async c=>{
      const a=(await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[candidate.account_id])).rows[0];
      const j=(await c.query('SELECT * FROM job WHERE id=$1 FOR UPDATE',[candidate.job_id])).rows[0];
      const s=await lockSubmission(c,candidate.job_id);
      const now=await clock(c); // AFTER account -> job -> submission waits.
      if(!a||!j||j.account_id!==a.id||!s||s.id!==candidate.id)return null;
      return action(c,s,now);
    });
  }
  function current(s,claim,now) {
    return s.cleanup_state==='claimed'&&s.cleanup_fence===claim.fence&&+now<time(s.cleanup_lease_until)&&
      IDENTITY.every(k=>s[k]===claim.submission[k])&&
      sameTime(s.attempt_deadline,claim.submission.attempt_deadline)&&
      sameTime(s.submitting_at,claim.submission.submitting_at);
  }
  async function finishLocked(c,s,state,now) {
    await c.query(`UPDATE provider_submission SET cleanup_state=$2,cleanup_lease_until=NULL,
      cancel_confirmed_at=CASE WHEN $2='done' AND provider_status='canceled'
        THEN COALESCE(cancel_confirmed_at,$3) ELSE cancel_confirmed_at END WHERE id=$1`,[s.id,state,now]);
    return state;
  }
  async function claim(candidate) {
    return ordered(candidate,async(c,s,now)=>{
      if(s.cleanup_state!=='needed'&&!(s.cleanup_state==='claimed'&&time(s.cleanup_lease_until)<=+now))return null;
      if(!Number.isSafeInteger(s.cleanup_fence)||s.cleanup_fence>=2147483647)return null;
      const fence=s.cleanup_fence+1;
      await c.query(`UPDATE provider_submission SET cleanup_state='claimed',cleanup_fence=$2,
        cleanup_lease_until=$3 WHERE id=$1`,[s.id,fence,new Date(+now+30000)]);
      return Object.freeze({...candidate,fence,submission:Object.freeze({...s})});
    });
  }
  async function prepare(claim,remaining) {
    return ordered(claim,async(c,s,now)=>{
      if(!current(s,claim,now))return {state:'stale'};
      const state=disposition(s,now);
      if(state)return {state:await finishLocked(c,s,state,now)};
      if(remaining()<=0)return {state:await finishLocked(c,s,'needed',now)};
      const action=s.cancel_requested_at?'get':'cancel';
      if(action==='cancel')await c.query('UPDATE provider_submission SET cancel_requested_at=$2 WHERE id=$1',[s.id,now]);
      return {action,submission:Object.freeze({...s})};
    });
  }
  async function reconcile(claim) {
    return ordered(claim,async(c,s,now)=>{
      // An observation may already have finalized this owner's terminal status.
      if(s.cleanup_state==='done'&&s.cleanup_fence===claim.fence)return 'done';
      if(!current(s,claim,now))return 'stale';
      return finishLocked(c,s,disposition(s,now)??'needed',now);
    });
  }
  function authority(claim) {
    return Object.freeze({async observe(jobId,input) {
      if(jobId!==claim.job_id)deny();
      const result=await ordered(claim,async(c,s,now)=>{
        if(!current(s,claim,now)||!retained(s,now)||s.identity_conflict_at)deny();
        const observed=await observePredictionLocked(c,s,input,now);
        if(TERMINAL.includes(observed.status))
          await finishLocked(c,{...s,provider_status:observed.status},'done',now);
        // No opaque I2 output handle or URL leaves this private collaborator.
        return {status:observed.status};
      });
      if(!result)deny();return result;
    }});
  }
  async function pass() {
    const result=counts();if(!enabled)return Object.freeze(result);
    const start=monotonicNow();let last=start;
    const remaining=()=>{
      const now=monotonicNow();if(!Number.isFinite(now)||now<last)deny();last=now;
      return Math.floor(5000-(now-start));
    };
    if(!Number.isFinite(start))deny();
    const candidates=(await pool.query(`SELECT s.id,s.job_id,j.account_id FROM provider_submission s
      JOIN job j ON j.id=s.job_id WHERE s.cleanup_state='needed' OR
      (s.cleanup_state='claimed' AND s.cleanup_lease_until<=clock_timestamp())
      ORDER BY s.created_at,s.id LIMIT 100`)).rows;
    result.scanned=candidates.length;
    for(const candidate of candidates) {
      if(remaining()<=0)break;
      let owned;
      try {
        owned=await claim(candidate);if(!owned)continue;result.claimed++;
        const ready=await prepare(owned,remaining);
        if(!ready){result.stale++;continue;}
        if(ready.state){result[ready.state]++;continue;}
        const duration=remaining();
        if(duration>0) {
          // Fresh duration ONLY for cleanup; immutable original timestamp identity.
          const budget=createReplicateBudget(ready.submission.attempt_deadline,Math.min(5000,duration),
            {now:monotonicNow,trustedRemaining:remaining});
          result.actions++;
          try {await transport[ready.action]({authority:authority(owned),submission:ready.submission,budget});}
          catch {result.errors++;} // Raw transport/DB payloads never leave pass.
        }
        const state=await reconcile(owned);result[state??'stale']++;
      }catch {result.errors++;} // Uncertain transaction leaves bounded lease for next pass.
    }
    return Object.freeze(result);
  }
  return Object.freeze({pass});
}
