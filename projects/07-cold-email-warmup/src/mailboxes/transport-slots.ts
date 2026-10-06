import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Pool } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
export interface TransportSlot {protocol:'smtp'|'imap';slot:number;operation:string;ownerProcess:string;ownerHost:string;tenant:string;mailbox:string}
export async function acquireTransportSlot(pool:Pool,protocol:TransportSlot['protocol'],tenant:string,mailbox:string):Promise<TransportSlot> {
 return eligibilityTransaction(pool,async c=>{
  if((await c.query('SELECT 1 FROM transport_operation WHERE protocol=$1 AND mailbox_id=$2 AND operation IS NOT NULL',[protocol,mailbox])).rowCount)throw new HttpError(503,'transport_busy');
  const free=(await c.query('SELECT slot FROM transport_operation WHERE protocol=$1 AND operation IS NULL ORDER BY slot LIMIT 1 FOR UPDATE',[protocol])).rows[0];if(!free)throw new HttpError(503,'transport_busy');
  const result={protocol,slot:free.slot,operation:randomUUID(),ownerProcess:randomUUID(),ownerHost:hostname(),tenant,mailbox};
  await c.query(`UPDATE transport_operation SET operation=$3,tenant_id=$4,mailbox_id=$5,owner_process=$6,owner_host=$7,expires_at=clock_timestamp()+interval '120 seconds' WHERE protocol=$1 AND slot=$2`,[protocol,result.slot,result.operation,tenant,mailbox,result.ownerProcess,result.ownerHost]);return result;
 });
}
// A proof is an unforgeable in-process closure created by the exact child lifetime owner.
const proofs=new WeakMap<object,TransportSlot>();
export function closedOwnerProof(slot:TransportSlot){const proof={};proofs.set(proof,slot);return proof;}
export async function releaseTransportSlot(pool:Pool,proof:object) {
 const s=proofs.get(proof);if(!s)throw new HttpError(403,'closure_unproved');
 const result=await eligibilityTransaction(pool,c=>c.query(`UPDATE transport_operation SET operation=NULL,tenant_id=NULL,mailbox_id=NULL,owner_process=NULL,owner_host=NULL,expires_at=NULL WHERE protocol=$1 AND slot=$2 AND operation=$3 AND owner_process=$4 AND owner_host=$5`,[s.protocol,s.slot,s.operation,s.ownerProcess,s.ownerHost]));
 if(result.rowCount)proofs.delete(proof);return result.rowCount===1;
}
