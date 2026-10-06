import type { Pool,PoolClient } from 'pg';
import { HttpError } from '../errors.js';
import { observationInput,UUID,type Observation } from './input.js';
import { compare } from './compare.js';
export async function evidenceTransaction<T>(pool:Pool,tenant:string,fn:(db:PoolClient)=>Promise<T>):Promise<T> {
 const db=await pool.connect();try {await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(8,hashtext($1))',[tenant]);const value=await fn(db);await db.query('COMMIT');return value;} catch(error){await db.query('ROLLBACK');throw error;} finally{db.release();}
}
export async function ownObservation(db:Pool|PoolClient,tenant:string,id:string):Promise<Observation> {
 if(!UUID.test(id)) throw new HttpError(404,'not_found');
 const row=(await db.query('SELECT evidence FROM evidence_observation WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];
 if(!row) throw new HttpError(404,'not_found');return row.evidence as Observation;
}
export async function serverNow(db:Pool|PoolClient):Promise<number> {return Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);}
export class EvidenceStore {
 constructor(readonly pool:Pool){}
 async create(tenant:string,input:Record<string,unknown>) {
  const evidence=observationInput(input);
  return evidenceTransaction(this.pool,tenant,async db=>{
   if(Date.parse(evidence.observedAt)>await serverNow(db)) throw new HttpError(400,'future_observation');
   if(Number((await db.query('SELECT count(*) FROM evidence_observation WHERE tenant_id=$1',[tenant])).rows[0].count)>=1000) throw new HttpError(409,'history_limit');
   return (await db.query('INSERT INTO evidence_observation(tenant_id,evidence) VALUES($1,$2) RETURNING id,evidence,created_at',[tenant,evidence])).rows[0];
  });
 }
 async list(tenant:string,limit:number,offset:number) {
  const observations=(await this.pool.query('SELECT id,evidence,created_at FROM evidence_observation WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[tenant,limit,offset])).rows;
  return {observations,reputation:'unknown',reason:'No independently verified reputation score',provenance:'manual/user-confirmed',localSmtpCounters:'separate; SMTP acceptance is not inbox delivery',limit,offset};
 }
 async pair(tenant:string,baselineId:string,latestId:string) {
  const baseline=await ownObservation(this.pool,tenant,baselineId),latest=await ownObservation(this.pool,tenant,latestId);
  return {baseline,latest,...compare(baseline,latest,await serverNow(this.pool))};
 }
}
