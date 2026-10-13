import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { HttpError, requireUuid, Capacity } from './boundaries.js';
import { transaction } from './db.js';
import { artifactRead, canonical, sha } from './generation.js';
import { qualityEligible, validateEvidence } from './quality.js';
import { supportedRealMode, REAL_MODE_SQL } from './replicate-quality.js';
import { STYLES } from './jobs.js';
import { createCompositeCache } from './composite.js';

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const missing=()=>new HttpError(404,'not_found');
const SELECT=`SELECT e.*,j.id,j.account_id,j.status,j.quality,j.deleted_at,j.style,j.mode AS job_mode,j.output_key,
 u.deleted_at AS upload_deleted,u.sha256 AS upload_sha,u.private_key AS input_key,
 a.billing_hold,a.badge_free_entitlement,
 EXISTS(SELECT 1 FROM quality_review q WHERE q.job_id=j.id AND q.decision='accepted'
  AND q.output_sha=e.output_sha AND q.evidence_sha=e.evidence_sha AND q.corpus_sha IS NOT NULL) AS reviewed
 FROM job j JOIN upload u ON u.id=j.upload_id AND u.account_id=j.account_id
 JOIN account a ON a.id=j.account_id JOIN generation_evidence e ON e.job_id=j.id WHERE j.id=$1`;
const available=r=>r&&r.status==='succeeded'&&!r.deleted_at&&!r.upload_deleted&&r.quality!=='rejected'&&r.mode===r.job_mode;
const paid=r=>r.badge_free_entitlement===true&&r.billing_hold===false;
const publicEligible=r=>available(r)&&supportedRealMode(r.mode)&&r.quality==='accepted'&&r.reviewed===true&&r.billing_hold===false;
const binding=r=>canonical([r.id,r.account_id,r.output_key,r.input_key,r.upload_sha,r.input_sha,r.output_sha,r.evidence_sha,r.mode,r.quality,r.style]);
const shareBinding=s=>canonical([s.token,s.job_id,s.published,s.revoked_at,s.version,s.input_sha,s.output_sha,s.evidence_sha,s.source_context,s.description,s.style]);
export function requireOwner(row,accountId) {
  if(row.account_id!==accountId)throw missing();
}
export function validatePublication(input) {
  const length=v=>typeof v==='string'?[...v].length:0;
  if(!input||input.publish!==true||!STYLES.includes(input.style)||length(input.source_context)<1||length(input.source_context)>160||
    length(input.description)<40||length(input.description)>2000||!input.source_context.trim()||!input.description.trim()||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.source_context+input.description))throw new HttpError(422,'invalid_publication');
  return {source_context:input.source_context,description:input.description,style:input.style};
}
function pageInput({before,limit=10}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>20||before!==undefined&&!TOKEN.test(before))throw new HttpError(400,'invalid_page');
  return {before,limit};
}
const view=s=>({token:s.token,source_context:s.source_context,description:s.description,style:s.style,
 page:'/s/'+s.token,composite:'/s/'+s.token+'/composite'});
export function createSharing(pool,config,{afterPrepare}={}) {
  const cache=createCompositeCache(),capacity=new Capacity(2);
  async function row(id) {requireUuid(id);return (await pool.query(SELECT,[id])).rows[0];}
  async function prepare(id,accountId,token) {
    const r=await row(id);if(!available(r))throw missing();
    if(accountId!==undefined)requireOwner(r,accountId);
    let s;
    if(token) {
      s=(await pool.query('SELECT * FROM share WHERE token=$1 AND job_id=$2 AND published',[token,id])).rows[0];
      if(!s||!publicEligible(r)||s.input_sha!==r.input_sha||s.output_sha!==r.output_sha||s.evidence_sha!==r.evidence_sha)throw missing();
    }
    try {
      const e=validateEvidence(r);
      if(r.upload_sha!==e.input_sha)throw missing();
      if(token&&!await qualityEligible(pool,id,config.storageDir))throw missing();
      const [before,after]=await Promise.all([artifactRead(config.storageDir,r.input_key),artifactRead(join(config.storageDir,'outputs'),r.output_key)]);
      if(sha(before)!==e.input_sha||sha(after)!==e.output_sha)throw missing();
      const key=canonical([sha(before),sha(after),paid(r),r.mode,r.quality,r.evidence_sha,s?.token??null,s?.version??0]);
      const image=await cache.get(key,before,after,{badgeFree:paid(r),mode:r.mode,quality:r.quality});
      const proof={r,s,image};await afterPrepare?.(proof);return proof;
    }catch(error) {if(error instanceof HttpError)throw error;throw missing();}
  }
  async function authorize(c,proof,accountId) {
    const {r,s}=proof;
    const a=(await c.query('SELECT billing_hold,badge_free_entitlement FROM account WHERE id=$1 FOR UPDATE',[r.account_id])).rows[0];
    await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[r.id]);
    const final=(await c.query(SELECT,[r.id])).rows[0];
    if(!available(final)||binding(final)!==binding(r))throw missing();
    if(accountId!==undefined)requireOwner(final,accountId);
    // This final guard also protects cache hits: never send stale paid bytes.
    if(!a||paid(a)!==paid(r))throw missing();
    if(s) {
      const live=(await c.query('SELECT * FROM share WHERE token=$1 FOR UPDATE',[s.token])).rows[0];
      if(!publicEligible(final)||a.billing_hold||!live||!live.published||shareBinding(live)!==shareBinding(s))throw missing();
    }
    return final;
  }
  async function event(c,accountId,id,key,type) {
    await c.query(`INSERT INTO event(id,account_id,type,reference,dedupe_key) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(dedupe_key) DO NOTHING`,[randomUUID(),accountId,type,id,`share:${accountId}:${id}:${key}:${type}`]);
  }
  async function action(c,accountId,id,key) {
    return (await c.query('SELECT * FROM share_action WHERE account_id=$1 AND job_id=$2 AND event_key=$3 FOR UPDATE',[accountId,id,key])).rows[0];
  }
  const api={
    async attempt(accountId,id,input) {
      requireUuid(id);requireUuid(input?.event_key);
      if(!['native','download'].includes(input.mode))throw new HttpError(422,'invalid_share_mode');
      return capacity.run(async()=>{
        const proof=await prepare(id,accountId);
        await transaction(pool,async c=>{
          await authorize(c,proof,accountId);
          const old=await action(c,accountId,id,input.event_key);
          if(old&&old.mode!==input.mode)throw new HttpError(409,'share_action_conflict');
          await c.query(`INSERT INTO share_action(account_id,job_id,event_key,mode) VALUES($1,$2,$3,$4)
            ON CONFLICT DO NOTHING`,[accountId,id,input.event_key,input.mode]);
          await event(c,accountId,id,input.event_key,'share_attempt');
        });
        return {event_key:input.event_key,mode:input.mode,quality:proof.r.quality,demo:proof.r.mode==='fixture',
          artifact:`/api/jobs/${id}/composite/${input.mode}/${input.event_key}`};
      });
    },
    async ownerComposite(accountId,id,mode,key) {
      requireUuid(key);if(!['native','download'].includes(mode))throw missing();
      return capacity.run(async()=>{
        const proof=await prepare(id,accountId);
        await transaction(pool,async c=>{
          await authorize(c,proof,accountId);
          const a=await action(c,accountId,id,key);if(!a||a.mode!==mode)throw missing();
          await c.query('UPDATE share_action SET artifact_sha=$4 WHERE account_id=$1 AND job_id=$2 AND event_key=$3',[accountId,id,key,proof.image.sha]);
        });
        return {...proof.image,download:mode==='download',delivered:()=>mode==='download'?api.exportDelivered(accountId,id,key):Promise.resolve()};
      });
    },
    async exportDelivered(accountId,id,key) {
      // Called ONLY by HTTP response finish, never on close/abort/error.
      return transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId]);
        await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[id]);
        const a=await action(c,accountId,id,key);
        if(a?.mode==='download'&&a.artifact_sha)await event(c,accountId,id,key,'export_delivered');
      });
    },
    async outcome(accountId,id,input) {
      requireUuid(id);requireUuid(input?.event_key);
      if(!['resolved','abort','error','unavailable'].includes(input.outcome))throw new HttpError(422,'invalid_share_outcome');
      return transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId]);
        await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[id]);
        const r=(await c.query(SELECT,[id])).rows[0];if(!available(r))throw missing();requireOwner(r,accountId);
        const a=await action(c,accountId,id,input.event_key);
        if(!a||a.mode!=='native'||input.outcome==='resolved'&&!a.artifact_sha)throw new HttpError(409,'invalid_share_attempt');
        if(a.outcome&&a.outcome!==input.outcome)throw new HttpError(409,'share_outcome_conflict');
        await c.query('UPDATE share_action SET outcome=$4 WHERE account_id=$1 AND job_id=$2 AND event_key=$3',[accountId,id,input.event_key,input.outcome]);
        if(input.outcome==='resolved')await event(c,accountId,id,input.event_key,'share_completed');
        return {ok:true};
      });
    },
    async publish(accountId,id,input) {
      requireUuid(id);const metadata=validatePublication(input);
      return capacity.run(async()=>{
        const proof=await prepare(id,accountId);
        if(metadata.style!==proof.r.style||!publicEligible(proof.r)||!await qualityEligible(pool,id,config.storageDir))throw missing();
        return transaction(pool,async c=>{
          const r=await authorize(c,proof,accountId);if(!publicEligible(r))throw missing();
          const old=(await c.query('SELECT * FROM share WHERE job_id=$1 AND published FOR UPDATE',[id])).rows[0];
          if(old) {
            if(old.description!==metadata.description||old.source_context!==metadata.source_context||old.style!==metadata.style)throw new HttpError(409,'publication_conflict');
            return view(old);
          }
          const s=(await c.query(`INSERT INTO share(token,job_id,source_context,description,style,input_sha,output_sha,evidence_sha)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[randomBytes(32).toString('base64url'),id,metadata.source_context,metadata.description,metadata.style,r.input_sha,r.output_sha,r.evidence_sha])).rows[0];
          return view(s);
        });
      });
    },
    async state(accountId,id) {
      const r=await row(id);if(!r||r.deleted_at)throw missing();requireOwner(r,accountId);
      return transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId]);
        await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[id]);
        const final=(await c.query(SELECT,[id])).rows[0];if(!final||final.deleted_at)throw missing();requireOwner(final,accountId);
        const s=(await c.query('SELECT * FROM share WHERE job_id=$1 AND published FOR UPDATE',[id])).rows[0];
        return {published:!!s,available:!!s&&publicEligible(final),publication:s?view(s):null};
      });
    },
    async revoke(accountId,id) {
      const r=await row(id);if(!r)throw missing();requireOwner(r,accountId);
      return transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId]);
        await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[id]);
        const final=(await c.query(SELECT,[id])).rows[0];if(!final)throw missing();requireOwner(final,accountId);
        await c.query('UPDATE share SET published=false,revoked_at=clock_timestamp(),version=version+1 WHERE job_id=$1 AND published',[id]);
        return {ok:true};
      });
    },
    async publicRead(token) {
      if(!TOKEN.test(token))throw missing();
      return capacity.run(async()=>{
        const s=(await pool.query('SELECT job_id FROM share WHERE token=$1 AND published',[token])).rows[0];if(!s)throw missing();
        const proof=await prepare(s.job_id,undefined,token);
        await transaction(pool,c=>authorize(c,proof));
        return {...view(proof.s),image:proof.image};
      });
    },
    async list(input) {
      const {before,limit}=pageInput(input);
      if(before&&!(await pool.query('SELECT token FROM share WHERE token=$1',[before])).rowCount)throw new HttpError(400,'invalid_page');
      // Bounded candidate page; excluded entries are not backfilled with an unbounded scan.
      const rows=(await pool.query(`SELECT s.token FROM share s JOIN job j ON j.id=s.job_id JOIN account a ON a.id=j.account_id
        WHERE s.published AND j.deleted_at IS NULL AND j.quality='accepted' AND j.mode IN ${REAL_MODE_SQL} AND NOT a.billing_hold
        AND ($1::text IS NULL OR (s.created_at,s.token)<(SELECT created_at,token FROM share WHERE token=$1))
        ORDER BY s.created_at DESC,s.token DESC LIMIT $2`,[before??null,limit+1])).rows;
      return capacity.run(async()=>{
        const proofs=[];
        for(const s of rows.slice(0,limit)) {
          try {
            const candidate=(await pool.query('SELECT job_id FROM share WHERE token=$1 AND published',[s.token])).rows[0];
            if(candidate)proofs.push(await prepare(candidate.job_id,undefined,s.token));
          }catch(e) {if(!(e instanceof HttpError)||e.status!==404)throw e;}
        }
        // One final list authorization after ALL byte/image work. Lock each class
        // in stable order so multi-owner pages cannot deadlock each other.
        const items=await transaction(pool,async c=>{
          await c.query('SELECT id FROM account WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[...new Set(proofs.map(p=>p.r.account_id))].sort()]);
          await c.query('SELECT id FROM job WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[proofs.map(p=>p.r.id).sort()]);
          await c.query('SELECT token FROM share WHERE token=ANY($1::text[]) ORDER BY token FOR UPDATE',[proofs.map(p=>p.s.token).sort()]);
          const allowed=[];
          for(const p of proofs) {
            try {await authorize(c,p);allowed.push(view(p.s));}catch(e) {if(!(e instanceof HttpError)||e.status!==404)throw e;}
          }
          return allowed;
        });
        return {items,next:rows.length>limit?rows[limit-1].token:null};
      });
    }
  };return api;
}
