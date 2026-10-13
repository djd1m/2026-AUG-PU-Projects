import { randomUUID } from 'node:crypto';
import { readReplicateCleanupConfig } from '../web/replicate-worker-config.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';
export { mockBoundary } from './replicate-generation-fixtures.js';
export const cleanupEnv=()=>({REPLICATE_CLEANUP_ENABLED:'true',REPLICATE_MODEL,REPLICATE_VERSION,
  REPLICATE_CONTRACT_SHA,REPLICATE_API_TOKEN:'offline-synthetic-cleanup-token'});
export const cleanupConfig=()=>readReplicateCleanupConfig({runtime:'test'},cleanupEnv());
export const prediction=(status='processing',id='prediction_1')=>({id,model:REPLICATE_MODEL,
  version:REPLICATE_VERSION,status,output:['https://replicate.delivery/private-depth','https://replicate.delivery/private-output']});
export function memoryFixture(patch={},n=1) {
  let now=new Date('2026-10-03T12:05:00Z'),mono=0;
  const rows=Array.from({length:n},(_,i)=>({id:randomUUID(),job_id:randomUUID(),account_id:randomUUID(),
    provider:'replicate',model:REPLICATE_MODEL,version:REPLICATE_VERSION,contract_sha:REPLICATE_CONTRACT_SHA,
    prediction_id:i?'prediction_'+(i+1):'prediction_1',request_sha:'c'.repeat(64),attempt_number:1,
    attempt_ticket_id:randomUUID(),submission_fence:1,attempt_deadline:new Date('2026-10-03T12:03:00Z'),
    submitting_at:new Date('2026-10-03T12:00:00Z'),provider_status:'processing',state:'known',identity_conflict_at:null,
    cleanup_state:'needed',cleanup_fence:0,cleanup_lease_until:null,cancel_requested_at:null,cancel_confirmed_at:null,...patch}));
  const queries=[];
  async function query(sql,values=[]) {
    queries.push({sql,values});const s=rows.find(r=>r.id===values[0]||r.job_id===values[0]||r.account_id===values[0]);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
    if(sql.includes('SELECT s.id,s.job_id'))return {rows:rows.filter(r=>r.cleanup_state==='needed'||
      r.cleanup_state==='claimed'&&+r.cleanup_lease_until<=+now).slice(0,100).map(r=>({id:r.id,job_id:r.job_id,account_id:r.account_id}))};
    if(sql.includes('SELECT id FROM account'))return {rows:s?[{id:s.account_id}]:[]};
    if(sql.includes('SELECT * FROM job'))return {rows:s?[{id:s.job_id,account_id:s.account_id}]:[]};
    if(sql.includes('SELECT * FROM provider_submission'))return {rows:s?[{...s}]:[]};
    if(sql.includes("cleanup_state='claimed',cleanup_fence"))Object.assign(s,{cleanup_state:'claimed',cleanup_fence:values[1],cleanup_lease_until:values[2]});
    else if(sql.includes('SET cancel_requested_at'))s.cancel_requested_at=values[1];
    else if(sql.includes('SET provider_status'))Object.assign(s,{provider_status:values[1],observed_at:values[2],state:values[3]?'terminal':s.state});
    else if(sql.includes('SET cleanup_state=$2')) {
      s.cleanup_state=values[1];s.cleanup_lease_until=null;
      if(values[1]==='done'&&s.provider_status==='canceled')s.cancel_confirmed_at??=values[2];
    }else throw new Error('Unexpected fixture query');
    return {rows:[],rowCount:1};
  }
  const pool={query,connect:async()=>({query,release(){}})};
  return {pool,rows,queries,trustedClock:()=>now,monotonicNow:()=>mono,
    advance:ms=>{now=new Date(+now+ms);},tick:ms=>{mono+=ms;}};
}
