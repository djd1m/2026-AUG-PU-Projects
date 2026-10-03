import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { currentEntitlement } from '../billing/plans.js';
import { METRICS,UUID,keyInput,type Observation } from '../evidence/input.js';
import { compare,DAY } from '../evidence/compare.js';
import { evidenceTransaction,ownObservation,serverNow } from '../evidence/store.js';
export interface PublicSnapshot {
 title:string; metric:keyof typeof METRICS; unit:'count'; direction:'higher'|'lower'; sourceOrigin:string;
 provenance:'manual/user-confirmed'; baseline:PublicValue; latest:PublicValue; display:'raw_counts'|'ratios';
}
interface PublicValue {observedAt:string;windowStart:string;windowEnd:string;numerator:number;denominator:number}
function publicValue(o:Observation):PublicValue {return {observedAt:o.observedAt,windowStart:o.windowStart,windowEnd:o.windowEnd,numerator:o.numerator,denominator:o.denominator};}
export function publicProjection(b:Observation,l:Observation,display:'raw_counts'|'ratios'):PublicSnapshot {
 return {title:'Observed metric improvement',metric:l.metric,unit:l.unit,direction:l.direction,sourceOrigin:new URL(l.sourceUrl).origin,provenance:'manual/user-confirmed',baseline:publicValue(b),latest:publicValue(l),display};
}
function escape(value:string|number) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function reportHtml(s:PublicSnapshot,badge:boolean,historical:boolean) {
 const row=(label:string,v:PublicValue)=>`<tr><th scope="row">${label}</th><td>${escape(v.observedAt)}</td><td>${escape(v.windowStart)} – ${escape(v.windowEnd)}</td><td>${v.numerator}</td><td>${v.denominator}</td>${s.display==='ratios'?`<td>${escape((v.numerator/v.denominator*100).toFixed(2))}%</td>`:''}</tr>`;
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${historical?'Historical observations':escape(s.title)}</title><body><main><h1>${historical?'Historical observations':escape(s.title)}</h1><p>${historical?'Historical snapshot; no current improvement claim.':'Observed change; no causal warmup claim.'}</p><p>${escape(METRICS[s.metric])}; ${escape(s.unit)}; ${escape(s.direction)} is the declared improvement direction.</p><p>Source origin: ${escape(s.sourceOrigin)}. Provenance: ${escape(s.provenance)}. No independent provider verification.</p><table><caption>Immutable manual observations</caption><thead><tr><th scope="col">Observation</th><th scope="col">Observed at (UTC)</th><th scope="col">Window (UTC)</th><th scope="col">Raw numerator</th><th scope="col">Raw denominator</th>${s.display==='ratios'?'<th scope="col">Ratio</th>':''}</tr></thead><tbody>${row('Baseline',s.baseline)}${row('Latest',s.latest)}</tbody></table>${badge?'<p data-n7-source-badge><a href="/">N7 source</a></p>':''}</main></body></html>`;
}
export class ReportStore {
 constructor(readonly pool:Pool){}
 async share(tenant:string,input:Record<string,unknown>) {
  if(Object.keys(input).length!==3 || typeof input.baselineId!=='string' || typeof input.latestId!=='string') throw new HttpError(400,'invalid_input');
  const key=keyInput(input.idempotencyKey),baselineId=input.baselineId,latestId=input.latestId;
  return evidenceTransaction(this.pool,tenant,async db=>{
   const baseline=await ownObservation(db,tenant,baselineId),latest=await ownObservation(db,tenant,latestId);
   const existing=(await db.query('SELECT id,token,baseline_id,latest_id FROM evidence_report WHERE tenant_id=$1 AND idempotency_key=$2',[tenant,key])).rows[0];
   if(existing) {if(existing.baseline_id!==baselineId || existing.latest_id!==latestId) throw new HttpError(409,'idempotency_conflict');return {id:existing.id,url:'/reports/'+existing.token};}
   if((await db.query('SELECT id FROM evidence_event WHERE tenant_id=$1 AND idempotency_key=$2',[tenant,key])).rowCount) throw new HttpError(409,'idempotency_conflict');
   const result=compare(baseline,latest,await serverNow(db));
   if(!result.shareAllowed) throw new HttpError(409,result.reason);
   const counts=(await db.query('SELECT (SELECT count(*) FROM evidence_report WHERE tenant_id=$1) reports,(SELECT count(*) FROM evidence_event WHERE tenant_id=$1) events',[tenant])).rows[0];
   if(Number(counts.reports)>=200 || Number(counts.events)>=600) throw new HttpError(409,'history_limit');
   // This predicate evaluates the authoritative clock at the actual INSERT, after all locks/reads.
   const row=(await db.query(`INSERT INTO evidence_report(tenant_id,token,idempotency_key,baseline_id,latest_id,snapshot)
    SELECT $1,$2,$3,$4,$5,$6 WHERE $7::timestamptz>=clock_timestamp()-interval '7 days' AND $7::timestamptz<=clock_timestamp()
    RETURNING id,token`,[tenant,randomBytes(32).toString('base64url'),key,baselineId,latestId,publicProjection(baseline,latest,result.display),latest.observedAt])).rows[0];
   if(!row) throw new HttpError(409,'stale');
   await db.query("INSERT INTO evidence_event(tenant_id,report_id,kind,idempotency_key) VALUES($1,$2,'share',$3)",[tenant,row.id,key]);
   return {id:row.id,url:'/reports/'+row.token};
  });
 }
 async view(token:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(404,'not_found');
  const row=(await this.pool.query('SELECT tenant_id,snapshot FROM evidence_report WHERE token=$1 AND revoked_at IS NULL',[token])).rows[0];
  if(!row) throw new HttpError(404,'not_found');
  const entitlement=await currentEntitlement(this.pool,row.tenant_id);
  const snapshot=row.snapshot as PublicSnapshot;
  const historical=await serverNow(this.pool)-Date.parse(snapshot.latest.observedAt)>7*DAY;
  return reportHtml(snapshot,entitlement.plan!=='team',historical);
 }
 async list(tenant:string,limit:number,offset:number) {
  return (await this.pool.query('SELECT id,token,snapshot,created_at,revoked_at FROM evidence_report WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[tenant,limit,offset])).rows;
 }
 async revoke(tenant:string,id:string) {
  if(!UUID.test(id)) throw new HttpError(404,'not_found');
  const result=await this.pool.query('UPDATE evidence_report SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE tenant_id=$1 AND id=$2 RETURNING id',[tenant,id]);
  if(!result.rowCount) throw new HttpError(404,'not_found');return {revoked:true};
 }
 async event(tenant:string,id:string,input:Record<string,unknown>) {
  if(Object.keys(input).length!==2 || !['copy','link'].includes(String(input.kind))) throw new HttpError(400,'invalid_input');
  const key=keyInput(input.idempotencyKey);
  if(!UUID.test(id)) throw new HttpError(404,'not_found');
  return evidenceTransaction(this.pool,tenant,async db=>{
   if(!(await db.query('SELECT id FROM evidence_report WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL',[tenant,id])).rowCount) throw new HttpError(404,'not_found');
   const prior=(await db.query('SELECT report_id,kind FROM evidence_event WHERE tenant_id=$1 AND idempotency_key=$2',[tenant,key])).rows[0];
   if(prior) {if(prior.report_id!==id || prior.kind!==input.kind) throw new HttpError(409,'idempotency_conflict');return {recorded:true};}
   if(Number((await db.query('SELECT count(*) FROM evidence_event WHERE tenant_id=$1',[tenant])).rows[0].count)>=600) throw new HttpError(409,'history_limit');
   await db.query('INSERT INTO evidence_event(tenant_id,report_id,kind,idempotency_key) VALUES($1,$2,$3,$4)',[tenant,id,input.kind,key]);return {recorded:true};
  });
 }
 async events(tenant:string,limit:number,offset:number) {
  return (await this.pool.query('SELECT kind,created_at FROM evidence_event WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[tenant,limit,offset])).rows;
 }
 async aggregate(tenant:string) {
  const rows=(await this.pool.query('SELECT kind,count(*)::integer AS count FROM evidence_event WHERE tenant_id=$1 GROUP BY kind',[tenant])).rows;
  return {shares:rows.find(r=>r.kind==='share')?.count??0,copies:rows.find(r=>r.kind==='copy')?.count??0,links:rows.find(r=>r.kind==='link')?.count??0,display:'counts_only',provenance:'explicit owner actions',label:'TEST',reward:null};
 }
}
