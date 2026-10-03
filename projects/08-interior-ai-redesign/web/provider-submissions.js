import { randomUUID } from 'node:crypto';
import { transaction } from './db.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const STATUSES=['starting','processing','succeeded','failed','canceled','aborted'];
const TERMINAL=['succeeded','failed','canceled','aborted'];
const HASHES=['contract_sha','source_input_sha','transmitted_input_sha','request_sha',
  'authorization_sha','privacy_acceptance_sha','license_acceptance_sha','safety_acceptance_sha','billing_acceptance_sha'];
const ACCEPTANCES=HASHES.slice(4);
const FIELDS=['model','version','spend_budget_id','transform',...HASHES];
export class ProviderSubmissionError extends Error {
  constructor(code) { super(code); this.name='ProviderSubmissionError'; this.code=code; }
}
const deny=code=>{throw new ProviderSubmissionError(code);};
const uuid=value=>{if(typeof value!=='string'||!UUID.test(value))deny('invalid_submission');};
const digest=value=>{if(typeof value!=='string'||!SHA.test(value))deny('invalid_submission');};
const utcDay=now=>now.toISOString().slice(0,10);
const live=(j,now,fence)=>j.status==='running'&&!j.deleted_at&&j.fence===fence&&
  now<j.lease_until&&now<j.attempt_deadline&&now<j.hard_deadline;
const equalJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Closed numeric transform: no URL, input body, token or arbitrary metadata.
export function validatePreparedBinding(input) {
  if(!input||Object.keys(input).length!==FIELDS.length||Object.keys(input).some(k=>!FIELDS.includes(k)))deny('invalid_submission');
  uuid(input.spend_budget_id); digest(input.version); for(const k of HASHES)digest(input[k]);
  if(typeof input.model!=='string'||input.model.length>200||! /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(input.model))deny('invalid_submission');
  const t=input.transform,r=t?.content_rect;
  if(!t||Object.keys(t).sort().join(',')!=='canvas_height,canvas_width,content_rect,original_height,original_width'||
     !r||Object.keys(r).sort().join(',')!=='height,width,x,y')deny('invalid_submission');
  for(const n of [t.original_width,t.original_height,t.canvas_width,t.canvas_height,r.width,r.height])
    if(!Number.isSafeInteger(n)||n<1)deny('invalid_submission');
  for(const n of [r.x,r.y])if(!Number.isSafeInteger(n)||n<0)deny('invalid_submission');
  if(t.original_width*t.original_height>20000000||t.canvas_width!==512||t.canvas_height!==512||
     r.x+r.width>512||r.y+r.height>512)deny('invalid_submission');
  // Copy without invoking an untrusted toJSON; deterministic key order for comparisons.
  return {...Object.fromEntries(FIELDS.filter(k=>k!=='transform').map(k=>[k,input[k]])),transform:{
    original_width:t.original_width,original_height:t.original_height,canvas_width:512,canvas_height:512,
    content_rect:{x:r.x,y:r.y,width:r.width,height:r.height}}};
}
const canonicalTransform=t=>({original_width:t.original_width,original_height:t.original_height,
  canvas_width:t.canvas_width,canvas_height:t.canvas_height,
  content_rect:{x:t.content_rect.x,y:t.content_rect.y,width:t.content_rect.width,height:t.content_rect.height}});
function checkBinding(s,claim,b,ticketId) {
  if(s.attempt_number!==claim.attempt||s.submission_fence!==claim.fence||s.attempt_ticket_id!==ticketId||
     s.attempt_deadline.getTime()!==new Date(claim.attempt_deadline).getTime()||
     FIELDS.some(k=>k==='transform'?!equalJson(canonicalTransform(s.transform),b.transform):s[k]!==b[k]))deny('submission_binding_mismatch');
}
function identity(s,requestSha) { digest(requestSha); if(!s||s.request_sha!==requestSha)deny('submission_binding_mismatch'); }

// Internal integration API: caller owns account -> job locks in THIS transaction.
// None of these helpers commits, takes a budget lock, sends HTTP, or changes job state.
export async function lockSubmission(client,jobId) {
  uuid(jobId);
  return (await client.query('SELECT * FROM provider_submission WHERE job_id=$1 FOR UPDATE',[jobId])).rows[0]??null;
}
export async function bindPredictionLocked(client,job,submission,{request_sha,prediction_id,version},now) {
  identity(submission,request_sha);
  if(typeof prediction_id!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(prediction_id)||version!==submission.version)deny('invalid_prediction');
  if(submission.state==='preflight')deny('submission_not_authorized');
  async function conflict() {
    await client.query("UPDATE provider_submission SET cleanup_state='unresolved',identity_conflict_at=COALESCE(identity_conflict_at,$2) WHERE id=$1",[submission.id,now]);
    return {recorded:false,code:'prediction_identity_conflict',submission_id:submission.id,completion_authorized:false};
  }
  if(submission.prediction_id&&submission.prediction_id!==prediction_id)return conflict();
  const cleanup=!live(job,now,submission.submission_fence);
  await client.query('SAVEPOINT provider_identity');
  try {
    await client.query(`UPDATE provider_submission SET prediction_id=$2,
      state=CASE WHEN state='terminal' THEN state ELSE 'known' END,
      cleanup_state=CASE WHEN $3 THEN 'needed' ELSE cleanup_state END WHERE id=$1`,[submission.id,prediction_id,cleanup]);
    await client.query('RELEASE SAVEPOINT provider_identity');
  } catch(error) {
    if(error.code!=='23505')throw error;
    await client.query('ROLLBACK TO SAVEPOINT provider_identity');
    await client.query('RELEASE SAVEPOINT provider_identity');
    return conflict();
  }
  return {recorded:true,submission_id:submission.id,prediction_id,cleanup_required:cleanup,completion_authorized:false};
}
export async function markAmbiguousLocked(client,submission,requestSha) {
  identity(submission,requestSha);
  if(submission.prediction_id||submission.state!=='submitting')return {changed:false,state:submission.state};
  await client.query("UPDATE provider_submission SET state='ambiguous',cleanup_state='unresolved' WHERE id=$1",[submission.id]);
  return {changed:true,state:'ambiguous'};
}
export async function observePredictionLocked(client,submission,{request_sha,prediction_id,version,status},now) {
  identity(submission,request_sha);
  if(submission.prediction_id!==prediction_id||submission.version!==version)deny('prediction_identity_conflict');
  if(!STATUSES.includes(status))deny('invalid_prediction_status');
  const old=submission.provider_status;
  if(old===status||TERMINAL.includes(old)||(old==='processing'&&status==='starting'))
    return {changed:false,status:old};
  await client.query(`UPDATE provider_submission SET provider_status=$2,observed_at=$3,
    state=CASE WHEN $4 THEN 'terminal' ELSE state END WHERE id=$1`,[submission.id,status,now,TERMINAL.includes(status)]);
  return {changed:true,status};
}

export function createProviderSubmissions(pool,config,{trustedClock}={}) {
  if(!config||!Number.isSafeInteger(config.platformDailyLimit)||config.platformDailyLimit<1||config.platformDailyLimit>200||
     !Number.isSafeInteger(config.accountDailyLimit)||config.accountDailyLimit<1||config.accountDailyLimit>20||
     config.accountDailyLimit>config.platformDailyLimit)deny('invalid_submission_config');
  if(trustedClock!==undefined&&(config.runtime!=='test'||typeof trustedClock!=='function'))deny('invalid_submission_config');
  async function clock(c) {
    const now=trustedClock?new Date(await trustedClock()):(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if(!Number.isFinite(now.getTime()))deny('invalid_submission_clock');return now;
  }
  async function buckets(c,accountId,day) {
    const counts=[];
    for(const [bucket,owner] of [['platform','platform'],['account',accountId]]) {
      await c.query('INSERT INTO attempt_budget(bucket,owner,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[bucket,owner,day]);
      counts.push((await c.query('SELECT count FROM attempt_budget WHERE bucket=$1 AND owner=$2 AND day=$3 FOR UPDATE',[bucket,owner,day])).rows[0].count);
    }return counts;
  }
  async function owned(jobId,action) {
    uuid(jobId);
    const candidate=(await pool.query('SELECT account_id FROM job WHERE id=$1',[jobId])).rows[0];
    if(!candidate)deny('submission_not_found');
    return transaction(pool,async c=>{
      await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[candidate.account_id]);
      const j=(await c.query('SELECT * FROM job WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
      const s=await lockSubmission(c,jobId);return action(c,j,s,await clock(c));
    });
  }
  function checkClaim(claim,j) {
    uuid(claim?.job_id); uuid(claim?.account_id);
    if (!j || j.account_id!==claim.account_id || !Number.isInteger(claim.fence) ||
      j.fence!==claim.fence || j.attempts!==claim.attempt ||
      j.attempt_deadline?.getTime()!==new Date(claim.attempt_deadline).getTime()) deny('submission_fence_expired');
  }
  async function workerLocked(c,j,s,claim) {
    checkClaim(claim,j);
    // Account -> job -> submission -> envelope; no buckets for existing work.
    const budget=s?(await c.query('SELECT * FROM provider_spend_budget WHERE id=$1 FOR UPDATE',[s.spend_budget_id])).rows[0]:null;
    const now=await clock(c); // In particular AFTER a contended envelope lock.
    if (!live(j,now,claim.fence)) deny('submission_fence_expired');
    const input=(await c.query('SELECT id,private_key,sha256,width,height,mime,deleted_at FROM upload WHERE id=$1 AND account_id=$2',
      [j.upload_id,j.account_id])).rows[0];
    if (!input || input.deleted_at || (s && input.sha256!==s.source_input_sha)) deny('submission_input_revoked');
    if (s) {
      const ticket=(await c.query('SELECT * FROM attempt_ticket WHERE id=$1',[s.attempt_ticket_id])).rows[0];
      if (s.state==='preflight' || s.identity_conflict_at || s.provider!=='replicate' || j.mode!==null ||
        ['failed','canceled','aborted'].includes(s.provider_status) || s.submission_fence>j.fence || s.attempt_number!==j.attempts ||
        s.attempt_deadline.getTime()!==j.attempt_deadline.getTime() ||
        !ticket || ticket.job_id!==j.id || ticket.attempt_number!==j.attempts || !ticket.consumed_at || ticket.superseded ||
        (j.attempts===1 && j.first_ticket_id!==ticket.id)) deny('submission_binding_mismatch');
      if (!budget || budget.revoked_at || now<budget.window_start || now>=budget.window_end ||
        budget.ceiling_microusd==='0' || BigInt(budget.reserved_microusd)<BigInt(s.spend_reserved_microusd) ||
        ['model','version','contract_sha',...ACCEPTANCES].some(k=>budget[k]!==s[k]) ||
        budget.per_create_ceiling_microusd!==s.spend_reserved_microusd) deny('provider_spend_unauthorized');
      if (!s.prediction_id && s.state!=='submitting') deny('submission_no_replay');
    } else {
      const account=(await c.query('SELECT billing_hold FROM account WHERE id=$1',[j.account_id])).rows[0];
      if (account.billing_hold) deny('submission_billing_hold');
    }
    const remaining_ms=Math.min(j.attempt_deadline.getTime(),j.hard_deadline.getTime())-now.getTime();
    return {claim:{job_id:j.id,account_id:j.account_id,fence:j.fence,attempt:j.attempts,
      attempt_deadline:j.attempt_deadline,hard_deadline:j.hard_deadline,lease_until:j.lease_until},
      input,submission:s,db_now:now,remaining_ms};
  }
  return {
    // Read-only worker context; never a browser response or a new send permit.
    workerContext(claim) {return owned(claim?.job_id,(c,j,s)=>workerLocked(c,j,s,claim));},
    // I2 collaborator bound to the original CAS winner's claim. Recovery uses GET.
    async finalAuthorize(claim,check) {
      try {return await owned(claim?.job_id,async(c,j,s)=>{
        const context=await workerLocked(c,j,s,claim);
        return !!(s && s.state==='submitting' && !s.prediction_id &&
          s.submission_fence===claim.fence && check?.submission_id===s.id &&
          check.job_id===j.id && check.request_sha===s.request_sha && check.version===s.version &&
          new Date(check.attempt_deadline).getTime()===s.attempt_deadline.getTime() && context.remaining_ms>0);
      });} catch { return false; } // Exception/uncertain commit is never a send permit.
    },
    // A true result is the ONLY send authorization, valid only after this wrapper's commit.
    // Never call HTTP inside a client transaction. Any commit uncertainty means no send/replay.
    async authorize(claim,prepared) {
      const b=validatePreparedBinding(prepared);
      uuid(claim?.job_id);uuid(claim?.account_id);
      if(!Number.isInteger(claim.fence)||claim.fence<1||![1,2].includes(claim.attempt)||
         !Number.isFinite(new Date(claim.attempt_deadline).getTime()))deny('invalid_submission');
      const candidate=(await pool.query('SELECT account_id FROM job WHERE id=$1',[claim.job_id])).rows[0];
      if(!candidate||candidate.account_id!==claim.account_id)deny('submission_not_found');
      for(let pass=0;pass<3;pass++) {
        try {return await transaction(pool,async c=>{
          const day=utcDay(await clock(c)),counts=await buckets(c,claim.account_id,day);
          const account=(await c.query('SELECT * FROM account WHERE id=$1 FOR UPDATE',[claim.account_id])).rows[0];
          const j=(await c.query('SELECT * FROM job WHERE id=$1 FOR UPDATE',[claim.job_id])).rows[0];
          let s=await lockSubmission(c,claim.job_id);
          let now=await clock(c);if(utcDay(now)!==day)deny('utc_rollover_retry');
          if(!account||!j||j.account_id!==account.id)deny('submission_not_found');
          let ticket=(await c.query(`SELECT *,day::text AS utc_day FROM attempt_ticket
            WHERE job_id=$1 AND attempt_number=$2 AND NOT superseded`,[j.id,claim.attempt])).rows[0];
          if(!ticket||!ticket.consumed_at)deny('submission_ticket_mismatch');
          if((claim.attempt===1&&j.first_ticket_id!==ticket.id)||ticket.utc_day>day)deny('submission_ticket_mismatch');
          if(s) {
            checkBinding(s,claim,b,ticket.id);
            if(s.state!=='preflight')return {authorized:false,code:'submission_no_replay',submission:s};
          }
          if(!live(j,now,claim.fence)||j.attempts!==claim.attempt||
             j.attempt_deadline.getTime()!==new Date(claim.attempt_deadline).getTime())deny('submission_fence_expired');
          if(account.billing_hold)deny('submission_billing_hold');
          const upload=(await c.query('SELECT * FROM upload WHERE id=$1 AND account_id=$2',[j.upload_id,j.account_id])).rows[0];
          if(!upload||upload.deleted_at||upload.sha256!==b.source_input_sha)deny('submission_input_revoked');
          // Never alter an existing immutable preflight ticket binding.
          if(ticket.utc_day!==day) {
            if(s)deny('submission_ticket_mismatch');
            if(counts[0]>=config.platformDailyLimit||counts[1]>=config.accountDailyLimit)deny('submission_ticket_exhausted');
            await c.query('UPDATE attempt_ticket SET superseded=true WHERE id=$1',[ticket.id]);
            const id=randomUUID();
            await c.query(`UPDATE attempt_budget SET count=count+1 WHERE day=$1 AND
              ((bucket='platform' AND owner='platform') OR (bucket='account' AND owner=$2))`,[day,j.account_id]);
            await c.query('INSERT INTO attempt_ticket(id,job_id,attempt_number,day,consumed_at) VALUES($1,$2,$3,$4,$5)',[id,j.id,claim.attempt,day,now]);
            if(j.first_ticket_id===ticket.id)await c.query('UPDATE job SET first_ticket_id=$2 WHERE id=$1',[j.id,id]);
            ticket={...ticket,id};
          }
          const budget=(await c.query('SELECT * FROM provider_spend_budget WHERE id=$1 FOR UPDATE',[b.spend_budget_id])).rows[0];
          // Waiting on the envelope cannot authorize work past lease/deadline/midnight.
          now=await clock(c);if(utcDay(now)!==day)deny('utc_rollover_retry');
          if(!live(j,now,claim.fence))deny('submission_fence_expired');
          if(!budget||budget.revoked_at||now<budget.window_start||now>=budget.window_end||budget.ceiling_microusd==='0')deny('provider_spend_unauthorized');
          if(['model','version','contract_sha',...ACCEPTANCES].some(k=>budget[k]!==b[k]))deny('provider_authorization_mismatch');
          if(!s) {
            const keys=['id','job_id','attempt_number','attempt_ticket_id','submission_fence','attempt_deadline',...FIELDS,'spend_reserved_microusd'];
            const values=[randomUUID(),j.id,claim.attempt,ticket.id,claim.fence,j.attempt_deadline,
              ...FIELDS.map(k=>k==='transform'?JSON.stringify(b[k]):b[k]),budget.per_create_ceiling_microusd];
            s=(await c.query(`INSERT INTO provider_submission(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values)).rows[0];
          }
          if(s.spend_reserved_microusd!==budget.per_create_ceiling_microusd)deny('provider_authorization_mismatch');
          const reserved=await c.query(`UPDATE provider_spend_budget SET reserved_microusd=reserved_microusd+$2
            WHERE id=$1 AND ceiling_microusd-reserved_microusd >= $2 RETURNING id`,[budget.id,s.spend_reserved_microusd]);
          if(!reserved.rowCount)deny('provider_spend_exhausted');
          const cas=await c.query(`UPDATE provider_submission SET state='submitting',submitting_at=$2
            WHERE id=$1 AND state='preflight' RETURNING *`,[s.id,now]);
          if(cas.rowCount!==1)deny('submission_cas_failed');
          return {authorized:true,code:'submission_authorized',submission:cas.rows[0]};
        });}catch(error){if(error.code!=='utc_rollover_retry'||pass===2)throw error;}
      }
    },
    bindPrediction(jobId,input) {return owned(jobId,(c,j,s,now)=>bindPredictionLocked(c,j,s,input,now));},
    markAmbiguous(jobId,requestSha) {return owned(jobId,(c,j,s)=>markAmbiguousLocked(c,s,requestSha));},
    observe(jobId,input) {return owned(jobId,(c,j,s,now)=>observePredictionLocked(c,s,input,now));},
  };
}
