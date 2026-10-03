import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import type { HeaderInput } from './input.js';
export interface Snapshot {uidvalidity:string;uidNext:number;observedAt:Date;provenance:'local_fixture'}
export interface HeaderPage {uidvalidity:string;coveredThrough:number;headers:HeaderInput[];startedAt:Date;completedAt:Date}
export interface ReplyAdapter {
 readonly mode:'local_test';
 snapshot(tenant:string,mailbox:string):Promise<Snapshot>;
 read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number):Promise<HeaderPage>;
}
export class FixtureAdapter implements ReplyAdapter {
 readonly mode='local_test' as const;
 constructor(readonly pool:Pool) {}
 async snapshot(tenant:string,mailbox:string):Promise<Snapshot> {
  const r=(await this.pool.query('SELECT uidvalidity,uid_next,failed FROM local_reply_fixture WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox])).rows[0];
  if(!r || r.failed) throw new HttpError(503,'fixture_unavailable');
  return {uidvalidity:r.uidvalidity,uidNext:Number(r.uid_next),observedAt:new Date(),provenance:'local_fixture'};
 }
 async read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number):Promise<HeaderPage> {
  const startedAt=new Date();
  // One source snapshot attests sparse/expunged coverage. Fetch 101 to distinguish a
  // 100-header prefix from a complete range; never derive completion from count alone.
  const r=(await this.pool.query(`SELECT f.uidvalidity,f.uid_next,f.failed,
   (SELECT COALESCE(jsonb_agg(x.header ORDER BY (x.header->>'uid')::bigint),'[]'::jsonb)
    FROM (SELECT h AS header FROM jsonb_array_elements(f.headers) h
     WHERE (h->>'uid')::bigint>$3 AND (h->>'uid')::bigint<=$4 ORDER BY (h->>'uid')::bigint LIMIT 101) x) AS headers
   FROM local_reply_fixture f WHERE tenant_id=$1 AND mailbox_id=$2`,[tenant,mailbox,cursor,horizon])).rows[0];
  if(!r || r.failed || r.uidvalidity!==validity || Number(r.uid_next)-1<horizon) throw new HttpError(503,'fixture_unavailable');
  const rows=r.headers as HeaderInput[],headers=rows.slice(0,100);
  const coveredThrough=rows.length>100?headers[99]!.uid:horizon;
  return {uidvalidity:validity,headers,coveredThrough,startedAt,completedAt:new Date()};
 }
}
export async function boundedOperation<T>(operation:()=>Promise<T>,timeoutMs=30000):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new HttpError(503,'poll_timeout')),timeoutMs);})]);}
 finally {if(timer) clearTimeout(timer);}
}
