import { createHash, randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { HttpError, requireUuid } from './boundaries.js';
import { canonical, sha } from './generation.js';
import { validateHostedOutput, hostedWorkerBinding, hostedCompletionMatches } from './replicate-evidence.js';
import { isCleanupOnly, lockSubmission, markAmbiguousLocked } from './provider-submissions.js';

export const STYLES = ['warm','minimal','afrohemian','playful'];
export function jobInput(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(k=>!['upload_id','style','idempotency_key'].includes(k)) ||
      !STYLES.includes(input.style) || typeof input.idempotency_key !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.idempotency_key)) throw new HttpError(400,'invalid_job');
  const uploadId = requireUuid(input.upload_id).toLowerCase();
  return { uploadId, style:input.style, key:input.idempotency_key,
    hash:createHash('sha256').update(JSON.stringify([uploadId,input.style])).digest('hex') };
}
export function budgetLimits(config) {
  for (const [value,max] of [[config.platformDailyLimit,200],[config.accountDailyLimit,20]]) {
    if (!Number.isSafeInteger(value) || value<1 || value>max) throw new Error('Invalid attempt budget configuration');
  }
  if (config.accountDailyLimit>config.platformDailyLimit) throw new Error('Invalid attempt budget configuration');
}
const view = j => ({job_id:j.id,upload_id:j.upload_id,style:j.style,status:j.status,
  attempts:j.attempts,quality:j.quality,mode:j.mode,failure_reason:j.failure_reason,created_at:j.created_at,
  finished_at:j.finished_at,queue_deadline:j.queue_deadline,hard_deadline:j.hard_deadline,
  action:['queued','running'].includes(j.status)?'resume':j.status==='failed'?'new_job':'view'});
const day = now => now.toISOString().slice(0,10);
const plus = (now,ms) => new Date(now.getTime()+ms);
const bounded = (now,ms,deadline) => new Date(Math.min(now.getTime()+ms,deadline.getTime()));
const live = (j,now,fence) => j.status==='running' && !j.deleted_at && j.fence===fence &&
  now<j.lease_until && now<j.attempt_deadline && now<j.hard_deadline;

// Only internal callers receive this object. trustedClock is test-only,
// never an HTTP field. Other runtimes sample PostgreSQL time after acquiring locks.
export function createJobs(pool, config, {trustedClock} = {}) {
  budgetLimits(config);
  if (trustedClock!==undefined && (config.runtime!=='test' || typeof trustedClock!=='function')) throw new Error('Test clock requires test runtime and a function');
  async function clock(c) {
    const now = trustedClock ? new Date(await trustedClock()) : (await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid trusted clock');
    return now;
  }
  async function buckets(c,accountId,utcDay) {
    const result=[];
    for (const [bucket,owner] of [['platform','platform'],['account',accountId]]) {
      await c.query(`INSERT INTO attempt_budget(bucket,owner,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[bucket,owner,utcDay]);
      result.push((await c.query(`SELECT count FROM attempt_budget WHERE bucket=$1 AND owner=$2 AND day=$3 FOR UPDATE`,[bucket,owner,utcDay])).rows[0].count);
    }
    return result;
  }
  // A transaction that waits across midnight restarts before performing any effect.
  async function budgetTransaction(accountId,action) {
    for (let pass=0;pass<3;pass++) {
      try {
        return await transaction(pool,async c=>{
          const utcDay=day(await clock(c)); const counts=await buckets(c,accountId,utcDay);
          const account=(await c.query('SELECT id,billing_hold FROM account WHERE id=$1 FOR UPDATE',[accountId])).rows[0];
          const now=await clock(c);
          if (day(now)!==utcDay) throw new Error('utc_rollover_retry');
          if (!account) throw new HttpError(404,'not_found');
          return action(c,account,now,utcDay,counts);
        });
      } catch(error) { if (error.message!=='utc_rollover_retry' || pass===2) throw error; }
    }
  }
  async function ticket(c,j,number,utcDay,counts) {
    if (counts[0]>=config.platformDailyLimit || counts[1]>=config.accountDailyLimit) return null;
    await c.query(`UPDATE attempt_budget SET count=count+1 WHERE day=$1 AND
      ((bucket='platform' AND owner='platform') OR (bucket='account' AND owner=$2))`,[utcDay,j.account_id]);
    const id=randomUUID();
    await c.query(`INSERT INTO attempt_ticket(id,job_id,attempt_number,day) VALUES($1,$2,$3,$4)`,[id,j.id,number,utcDay]);
    return id;
  }
  async function release(c,j,now) {
    if (!j.reserved) return;
    await c.query(`INSERT INTO credit_ledger(id,account_id,delta,kind,reference,created_at)
      SELECT $1,$2,1,'release',$3,$4 WHERE EXISTS(SELECT 1 FROM credit_ledger WHERE kind='reserve' AND reference=$3)
      ON CONFLICT(kind,reference) DO NOTHING`,[randomUUID(),j.account_id,j.id,now]);
    await c.query('UPDATE job SET reserved=false WHERE id=$1',[j.id]);
  }
  async function cleanup(c,s) {
    if (!s || s.state==='preflight' || isCleanupOnly(s)) return;
    if (!s.prediction_id) {
      await markAmbiguousLocked(c,s,s.request_sha);
      await c.query("UPDATE provider_submission SET cleanup_state='unresolved' WHERE id=$1",[s.id]);
    } else await c.query(`UPDATE provider_submission SET cleanup_state=CASE
      WHEN identity_conflict_at IS NOT NULL THEN 'unresolved'
      WHEN cleanup_state='none' THEN 'needed' ELSE cleanup_state END WHERE id=$1`,[s.id]);
  }
  async function terminal(c,j,now,reason,s) {
    await cleanup(c,s);
    if (['succeeded','failed'].includes(j.status)) return;
    await c.query(`UPDATE job SET status='failed',failure_reason=$2,fence=fence+1,lease_until=NULL,
      finished_at=$3 WHERE id=$1`,[j.id,reason,now]);
    await release(c,j,now);
  }
  async function lockJob(c,id) { return (await c.query('SELECT * FROM job WHERE id=$1 FOR UPDATE',[id])).rows[0]; }
  async function ownedTransaction(id,action) {
    requireUuid(id);
    const candidate=(await pool.query('SELECT account_id FROM job WHERE id=$1',[id])).rows[0];
    if (!candidate) return false;
    return transaction(pool,async c=>{
      await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[candidate.account_id]);
      const j=await lockJob(c,id),s=await lockSubmission(c,id); return action(c,j,await clock(c),s);
    });
  }
  function reuse(j,input) {
    if (j.request_hash!==input.hash) throw new HttpError(409,'idempotency_conflict');
    return {job_id:j.id};
  }
  async function expire(c,j,now,s) {
    if (j.deleted_at || !['queued','running'].includes(j.status)) return false;
    if (now>=j.hard_deadline) { await terminal(c,j,now,'hard_deadline',s); return true; }
    if (s && now>=s.attempt_deadline) { await terminal(c,j,now,'attempt_deadline',s); return true; }
    if (s) return hostedInvalid(c,j,s,now);
    if (j.status==='queued' && now>=j.queue_deadline) { await terminal(c,j,now,'queue_expired'); return true; }
    return false;
  }
  async function hostedInvalid(c,j,s,now) {
    const ticket=(await c.query('SELECT * FROM attempt_ticket WHERE id=$1',[s.attempt_ticket_id])).rows[0];
    const input=(await c.query('SELECT * FROM upload WHERE id=$1 AND account_id=$2',[j.upload_id,j.account_id])).rows[0];
    let reason;
    if (s.identity_conflict_at) reason='prediction_identity_conflict';
    else if (['failed','canceled','aborted'].includes(s.provider_status)) reason='provider_failed';
    else if (isCleanupOnly(s)) reason='submission_binding_mismatch';
    else if (s.state==='preflight' || s.provider!=='replicate' || j.mode!==null ||
      j.fence<s.submission_fence || j.attempts!==s.attempt_number || j.attempt_deadline?.getTime()!==s.attempt_deadline.getTime() ||
      !ticket || ticket.job_id!==j.id || ticket.attempt_number!==s.attempt_number ||
      !ticket.consumed_at || ticket.superseded || (s.attempt_number===1 && j.first_ticket_id!==ticket.id)) reason='submission_binding_mismatch';
    else if (!input || input.deleted_at || input.sha256!==s.source_input_sha) reason='submission_input_revoked';
    else if (!s.prediction_id && (s.state==='ambiguous' || s.state==='terminal' || now>=j.lease_until || j.status==='queued')) reason='provider_create_ambiguous';
    if (!reason) return false;
    await terminal(c,j,now,reason,s); return true;
  }
  const claimView=j=>({job_id:j.id,account_id:j.account_id,upload_id:j.upload_id,style:j.style,
    fence:j.fence,attempt:j.attempts,attempt_deadline:j.attempt_deadline,hard_deadline:j.hard_deadline,lease_until:j.lease_until});
  async function reclaim(c,j,now,s) {
    if (j.deleted_at || !['queued','running'].includes(j.status) || await expire(c,j,now,s)) return null;
    if (!s.prediction_id || (j.status==='running' && now<j.lease_until)) return null;
    const deadline=new Date(Math.min(s.attempt_deadline.getTime(),j.hard_deadline.getTime()));
    const started=(await c.query(`UPDATE job SET status='running',fence=fence+1,heartbeat_at=$2,
      lease_until=$3 WHERE id=$1 RETURNING *`,[j.id,now,bounded(now,30000,deadline)])).rows[0];
    return {...claimView(started),provider_recovery:true};
  }
  return {
    // Trusted settlement already owns the account lock. Never open a nested transaction.
    async holdQueued(c,accountId) {
      const rows=(await c.query("SELECT * FROM job WHERE account_id=$1 AND status='queued' ORDER BY id FOR UPDATE",[accountId])).rows;
      const submissions=[];
      for(const j of rows)submissions.push(await lockSubmission(c,j.id));
      const now=await clock(c);
      for(let i=0;i<rows.length;i++) {
        if(submissions[i]) await expire(c,rows[i],now,submissions[i]);
        else await terminal(c,rows[i],now,'billing_hold');
      }
    },
    async reserve(accountId,body) {
      requireUuid(accountId); const input=jobInput(body);
      const prior=(await pool.query('SELECT * FROM job WHERE account_id=$1 AND idempotency_key=$2',[accountId,input.key])).rows[0];
      if (prior) return reuse(prior,input);
      return budgetTransaction(accountId,async(c,account,now,utcDay,counts)=>{
        const existing=(await c.query('SELECT * FROM job WHERE account_id=$1 AND idempotency_key=$2',[accountId,input.key])).rows[0];
        if (existing) return reuse(existing,input);
        if (!(await c.query('SELECT id FROM upload WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[input.uploadId,accountId])).rowCount) throw new HttpError(404,'not_found');
        if (account.billing_hold) throw new HttpError(403,'billing_hold');
        const balance=(await c.query('SELECT COALESCE(sum(delta),0)::int AS balance FROM credit_ledger WHERE account_id=$1',[accountId])).rows[0].balance;
        if (balance<1) throw new HttpError(409,'insufficient_credit');
        const j={id:randomUUID(),account_id:accountId};
        await c.query(`INSERT INTO job(id,account_id,upload_id,style,idempotency_key,request_hash,created_at,queue_deadline,hard_deadline)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[j.id,accountId,input.uploadId,input.style,input.key,input.hash,now,plus(now,60000),plus(now,360000)]);
        const id=await ticket(c,j,1,utcDay,counts);
        if (!id) throw new HttpError(429,'budget_exhausted');
        await c.query('UPDATE job SET first_ticket_id=$2 WHERE id=$1',[j.id,id]);
        await c.query(`INSERT INTO credit_ledger(id,account_id,delta,kind,reference,created_at) VALUES($1,$2,-1,'reserve',$3,$4)`,[randomUUID(),accountId,j.id,now]);
        return {job_id:j.id};
      });
    },
    async claim() {
      // Nonlocking candidate read. No job lock is taken ahead of budget/account locks.
      const now=await clock(pool);
      const candidates=(await pool.query(`SELECT id,account_id FROM job WHERE deleted_at IS NULL AND
        (status='queued' OR (status='running' AND (lease_until<=$1 OR attempt_deadline<=$1 OR hard_deadline<=$1
          OR EXISTS(SELECT 1 FROM provider_submission s WHERE s.job_id=job.id AND
            (s.cleanup_state<>'none' OR s.state='ambiguous' OR s.identity_conflict_at IS NOT NULL OR s.provider_status IN ('failed','canceled','aborted'))))))
        ORDER BY created_at,id LIMIT 50`,[now])).rows;
      for (const candidate of candidates) {
        // Hosted recovery never touches daily buckets or allocates a ticket.
        const recovery=await ownedTransaction(candidate.id,async(c,j,at,s)=>s ? reclaim(c,j,at,s) : 'local');
        if (recovery!=='local') { if(recovery)return recovery; continue; }
        const result=await budgetTransaction(candidate.account_id,async(c,account,_at,utcDay,counts)=>{
          const j=await lockJob(c,candidate.id),s=await lockSubmission(c,candidate.id);
          const at=await clock(c);
          if (day(at)!==utcDay) throw new Error('utc_rollover_retry');
          if (!j || j.deleted_at || !['queued','running'].includes(j.status)) return null;
          if (s) return reclaim(c,j,at,s);
          if (await expire(c,j,at,s)) return null;
          if (j.status==='running' && at<j.lease_until && at<j.attempt_deadline) return null;
          if (account.billing_hold) { await terminal(c,j,at,'billing_hold'); return null; }
          if (j.attempts>=2) { await terminal(c,j,at,'retry_limit'); return null; }
          // Expired lease is fenced in this same transaction before any new ticket/start.
          const number=j.attempts+1;
          let id=j.first_ticket_id;
          if (number===1) {
            const old=(await c.query('SELECT day::text AS day FROM attempt_ticket WHERE id=$1',[id])).rows[0];
            if (old.day!==utcDay) {
              await c.query('UPDATE attempt_ticket SET superseded=true WHERE id=$1',[id]);
              id=await ticket(c,j,number,utcDay,counts);
              if (id) await c.query('UPDATE job SET first_ticket_id=$2 WHERE id=$1',[j.id,id]);
            }
          } else id=await ticket(c,j,number,utcDay,counts);
          if (!id) { await terminal(c,j,at,'budget_exhausted'); return null; }
          await c.query('UPDATE attempt_ticket SET consumed_at=$2 WHERE id=$1',[id,at]);
          const deadline=bounded(at,180000,j.hard_deadline);
          const started=(await c.query(`UPDATE job SET status='running',attempts=attempts+1,fence=fence+1,
            heartbeat_at=$2,attempt_deadline=$3,lease_until=$4 WHERE id=$1 RETURNING *`,[j.id,at,deadline,bounded(at,30000,deadline)])).rows[0];
          return claimView(started);
        });
        if (result) return result;
      }
      return null;
    },
    async heartbeat(id,fence) {
      return ownedTransaction(id,async(c,j,now,s)=>{
        if (j.fence!==fence) return false;
        if (await expire(c,j,now,s)) return false;
        if (!live(j,now,fence)) return false;
        await c.query('UPDATE job SET heartbeat_at=$2,lease_until=$3 WHERE id=$1',[id,now,bounded(now,30000,new Date(Math.min(j.attempt_deadline.getTime(),j.hard_deadline.getTime())))]);
        return true;
      });
    },
    async complete(id,fence,output) {
      const validated=validateOutput(output,config.runtime),hosted=output.mode==='replicate';
      const outputKey=hosted?validated.output_key:output.output_key,mode=output.mode;
      const e=hosted?validated.evidence:{...output.evidence,model_revisions:validated};
      if(hosted && !hostedWorkerBinding(e,config)) return false;
      const canonicalEvidence=canonical({...e,job_id:id,output_key:outputKey,mode});
      const evidenceSha=sha(canonicalEvidence); // Serialization/hash before SQL locks.
      return ownedTransaction(id,async(c,j,now,s)=>{
        if (j.fence!==fence) return false;
        if (await expire(c,j,now,s) || !live(j,now,fence)) return false;
        if (hosted || s) {
          if (!hosted || !s) return false;
        }
        if (!hosted && j.mode!==null && j.mode!==mode) return false;
        const input=(await c.query('SELECT * FROM upload WHERE id=$1 AND account_id=$2',[j.upload_id,j.account_id])).rows[0];
        if(hosted) {
          const ticket=(await c.query('SELECT * FROM attempt_ticket WHERE id=$1',[s.attempt_ticket_id])).rows[0];
          if(!hostedCompletionMatches(j,s,ticket,input,e,now)) return false;
        } else if (!input || input.deleted_at || input.sha256!==e.input_sha) throw new Error('Output input binding mismatch');
        await c.query(`INSERT INTO generation_evidence(job_id,input_sha,output_sha,depth_sha,config_sha,model_revisions,
          seed,mode,worker_source_revision,hardware,queue_ms,inference_ms,warm,created_at,canonical_evidence,evidence_sha)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,e.input_sha,e.output_sha,e.depth_sha,e.config_sha,
          hosted?null:JSON.stringify(validated),e.seed,mode,e.worker_source_revision,e.hardware,e.queue_ms,e.inference_ms,e.warm,now,
          canonicalEvidence,evidenceSha]);
        await c.query(`UPDATE job SET status='succeeded',output_key=$2,mode=$3,quality='unverified',
          finished_at=$4,lease_until=NULL WHERE id=$1`,[id,outputKey,mode,now]);
        return true; // Active pre-hold work may finish privately; no public acceptance.
      });
    },
    async fail(id,fence,{retryable=false}={}) {
      return ownedTransaction(id,async(c,j,now,s)=>{
        if (j.fence!==fence || j.deleted_at || !['queued','running'].includes(j.status)) return false;
        if (await expire(c,j,now,s)) return true;
        if (s) { await terminal(c,j,now,'worker_failed',s); return true; }
        if (!live(j,now,fence)) return false;
        const held=(await c.query('SELECT billing_hold FROM account WHERE id=$1',[j.account_id])).rows[0].billing_hold;
        if (held || !retryable || j.attempts>=2) await terminal(c,j,now,held?'billing_hold':'worker_failed');
        else await c.query(`UPDATE job SET status='queued',fence=fence+1,lease_until=NULL,
          queue_deadline=$2 WHERE id=$1`,[id,bounded(now,60000,j.hard_deadline)]);
        return true;
      });
    },
    // Caller must hold account -> job locks. This is the same unique reserve
    // release used by terminal/deletion paths, not a second financial adapter.
    async releaseRejected(c,j,now) {
      if(j.status!=='succeeded'||j.quality!=='rejected')throw new Error('Quality release requires rejected successful job');
      await release(c,j,now);
    },
    async maintenance({limit=100}={}) {
      if (!Number.isSafeInteger(limit) || limit<1 || limit>1000) throw new Error('Invalid maintenance limit');
      const at=await clock(pool);
      const rows=(await pool.query(`SELECT j.id FROM job j JOIN account a ON a.id=j.account_id WHERE j.deleted_at IS NULL
        AND ((j.status='queued' AND (j.queue_deadline<=$1 OR j.hard_deadline<=$1 OR a.billing_hold))
          OR (j.status='running' AND (j.lease_until<=$1 OR j.attempt_deadline<=$1 OR j.hard_deadline<=$1
            OR EXISTS(SELECT 1 FROM provider_submission s WHERE s.job_id=j.id AND
              (s.cleanup_state<>'none' OR s.state='ambiguous' OR s.identity_conflict_at IS NOT NULL OR s.provider_status IN ('failed','canceled','aborted'))))))
        ORDER BY j.created_at,j.id LIMIT $2`,[at,limit])).rows;
      for (const {id} of rows) await ownedTransaction(id,async(c,j,now,s)=>{
        if (await expire(c,j,now,s) || s) return;
        const held=(await c.query('SELECT billing_hold FROM account WHERE id=$1',[j.account_id])).rows[0].billing_hold;
        if (j.status==='queued' && held) await terminal(c,j,now,'billing_hold');
        else if (j.status==='running' && (now>=j.lease_until || now>=j.attempt_deadline)) {
          if (held || j.attempts>=2) await terminal(c,j,now,held?'billing_hold':'retry_limit');
          else await c.query(`UPDATE job SET status='queued',fence=fence+1,lease_until=NULL,queue_deadline=$2 WHERE id=$1`,[id,bounded(now,60000,j.hard_deadline)]);
        }
      });
      return rows.length;
    },
    async get(accountId,id) {
      requireUuid(id);
      const j=(await pool.query('SELECT * FROM job WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[id,accountId])).rows[0];
      if (!j) throw new HttpError(404,'not_found');
      await ownedTransaction(id,async(c,current,now,s)=>{
        await expire(c,current,now,s);
        if (!s && current.status==='queued' && !current.deleted_at &&
            (await c.query('SELECT billing_hold FROM account WHERE id=$1',[accountId])).rows[0].billing_hold) await terminal(c,current,now,'billing_hold');
      });
      const current=(await pool.query('SELECT * FROM job WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[id,accountId])).rows[0];
      if (!current) throw new HttpError(404,'not_found');
      return view(current);
    },
    async list(accountId,{before,limit=50}={}) {
      if (!Number.isInteger(limit) || limit<1 || limit>50) throw new HttpError(400,'invalid_page');
      if (before) requireUuid(before);
      const rows=(await pool.query(`SELECT * FROM job WHERE account_id=$1 AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM job WHERE id=$2 AND account_id=$1 AND deleted_at IS NULL))
        ORDER BY created_at DESC,id DESC LIMIT $3`,[accountId,before??null,limit+1])).rows;
      return {jobs:rows.slice(0,limit).map(view),next:rows.length>limit?rows[limit-1].id:null};
    },
    async delete(accountId,id) {
      requireUuid(id);
      const j=(await pool.query('SELECT upload_id FROM job WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[id,accountId])).rows[0];
      if (!j) throw new HttpError(404,'not_found');
      return this.deleteUpload(accountId,j.upload_id);
    },
    async deleteUpload(accountId,id) {
      requireUuid(id);
      return transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId]);
        const rows=(await c.query('SELECT * FROM job WHERE upload_id=$1 AND account_id=$2 ORDER BY id FOR UPDATE',[id,accountId])).rows;
        const submissions=[];
        for(const j of rows)submissions.push(await lockSubmission(c,j.id));
        const now=await clock(c);
        const updated=await c.query('UPDATE upload SET deleted_at=$3 WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[id,accountId,now]);
        if (!updated.rowCount) throw new HttpError(404,'not_found');
        for (let i=0;i<rows.length;i++) {
          const j=rows[i];
          await terminal(c,j,now,'deleted',submissions[i]);
          await release(c,j,now);
          await c.query('UPDATE job SET deleted_at=$2,fence=fence+1 WHERE id=$1',[j.id,now]);
        }
      });
    }
  };
}
export function validateOutput(output,runtime) {
  if(output?.mode==='replicate') return validateHostedOutput(output);
  const e=output?.evidence;
  if (!output || !['fixture','controlnet'].includes(output.mode) || (runtime==='production' && output.mode==='fixture')) throw new Error('Invalid output mode');
  requireUuid(output.output_key);
  const revisions=e?.model_revisions;
  if (!revisions || (Object.getPrototypeOf(revisions)!==Object.prototype && Object.getPrototypeOf(revisions)!==null)) throw new Error('Incomplete generation evidence');
  const modelRevisions={};
  for (const key of ['sd','controlnet','depth']) {
    const value=revisions[key];
    if (!Object.hasOwn(revisions,key) || typeof value!=='string' || !value.length || value.length>200) throw new Error('Incomplete generation evidence');
    modelRevisions[key]=value;
  }
  if (!e || ['input_sha','output_sha','depth_sha','config_sha'].some(k=>!/^[a-f0-9]{64}$/.test(e[k]??'')) ||
      !Number.isSafeInteger(e.seed) || e.seed<0 || !Number.isSafeInteger(e.queue_ms) || e.queue_ms<0 ||
      !Number.isSafeInteger(e.inference_ms) || e.inference_ms<0 || typeof e.warm!=='boolean' ||
      typeof e.worker_source_revision!=='string' || !/^[a-f0-9]{40,64}$/.test(e.worker_source_revision) ||
      typeof e.hardware!=='string' || !e.hardware.length || e.hardware.length>500) throw new Error('Incomplete generation evidence');
  return modelRevisions;
}
