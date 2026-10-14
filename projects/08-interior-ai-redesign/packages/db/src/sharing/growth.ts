import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {DomainError,uuid} from '@n8/domain/common';
import {growthKinds,type GrowthKind} from '@n8/domain/sharing';
export interface GrowthInput {kind:GrowthKind;eventKey:string;requestId:string;accountId?:string;projectId?:string}
/** Internal port: no arbitrary client metadata; hash event identity before persistence. */
export async function recordGrowth(db:Pool|PoolClient,input:GrowthInput):Promise<boolean>{
 if(!growthKinds.includes(input.kind)||!uuid.safeParse(input.requestId).success||!/^[a-zA-Z0-9:_-]{1,160}$/.test(input.eventKey))throw new DomainError(422,'INVALID_EVENT','Некорректное событие');
 for(const id of [input.accountId,input.projectId])if(id!==undefined&&!uuid.safeParse(id).success)throw new DomainError(422,'INVALID_EVENT','Некорректное событие');
 const key=createHash('sha256').update(`${input.kind}:${input.eventKey}`).digest('hex');
 const result=await db.query(`INSERT INTO audit_event(kind,event_key,request_id,account_id,project_id,data) VALUES($1,$2,$3,$4,$5,'{}') ON CONFLICT(event_key) DO NOTHING RETURNING id`,[input.kind,key,input.requestId,input.accountId??null,input.projectId??null]);return result.rowCount===1;
}
export async function growthReport(pool:Pool,until=new Date()):Promise<{status:'known';since:string;until:string;counts:Record<GrowthKind,number>}|{status:'unknown';since:string;until:string;counts:null}>{
 if(!Number.isFinite(until.getTime()))throw new Error('Invalid reporting date');const since=new Date(until.getTime()-30*86400000);const bounds={since:since.toISOString(),until:until.toISOString()};
 try {const result=await pool.query<{kind:GrowthKind;n:string}>(`SELECT kind,count(*) n FROM audit_event WHERE kind=ANY($1::text[]) AND created_at >= $2 AND created_at < $3 GROUP BY kind`,[growthKinds,since,until]);const counts=Object.fromEntries(growthKinds.map(kind=>[kind,0])) as Record<GrowthKind,number>;for(const row of result.rows){const n=Number(row.n);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid counter');counts[row.kind]=n;}return {status:'known',...bounds,counts};}catch{return {status:'unknown',...bounds,counts:null};}
}
