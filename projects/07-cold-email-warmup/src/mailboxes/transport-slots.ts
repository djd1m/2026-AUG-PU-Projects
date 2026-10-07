import { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Pool,PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
export interface TransportSlot {protocol:'smtp'|'imap';slot:number;operation:string;ownerProcess:string;ownerHost:string;tenant:string;mailbox:string;purpose?:'body'}
const owners=new WeakMap<TransportSlot,{child:ChildProcess|null;sealed:boolean;consumed:boolean;unusedProof?:object}>();
export async function acquireTransportSlot(pool:Pool,protocol:TransportSlot['protocol'],tenant:string,mailbox:string):Promise<TransportSlot> {
 return eligibilityTransaction(pool,c=>acquireTransportSlotInTransaction(c,protocol,tenant,mailbox));
}
// Trusted caller must already hold FIRST pg_advisory_xact_lock(7,1).
export async function acquireTransportSlotInTransaction(c:PoolClient,protocol:TransportSlot['protocol'],tenant:string,mailbox:string,purpose?:'body'):Promise<TransportSlot> {
  if(purpose==='body'){
   // Durable unknown predecessors conservatively consume BODY capacity.
   // Known headers keep their physical owners while hosting the movable reservation.
   if(protocol!=='imap'||(await c.query("SELECT 1 FROM mailbox_poll WHERE mailbox_id=$1 AND NOT scan_complete UNION ALL SELECT 1 FROM runtime_due WHERE mailbox_id=$1 AND kind='poll' AND (state='claimed' OR due_at<=clock_timestamp())",[mailbox])).rowCount)throw new HttpError(503,'transport_busy');
   if(Number((await c.query("SELECT count(*) AS n FROM transport_operation WHERE protocol='imap' AND operation IS NOT NULL AND (operation_purpose='body' OR operation_purpose IS NULL)")).rows[0].n)>=3)throw new HttpError(503,'transport_busy');
  }
  if((await c.query('SELECT 1 FROM transport_operation WHERE protocol=$1 AND mailbox_id=$2 AND operation IS NOT NULL',[protocol,mailbox])).rowCount)throw new HttpError(503,'transport_busy');
  if(protocol==='imap'){
   const reserved=(await c.query("SELECT slot FROM transport_operation WHERE protocol='imap' AND header_reserved FOR UPDATE")).rows;
   if(reserved.length!==1)throw new HttpError(503,'transport_busy');
   if(purpose==='body'&&!(await c.query("SELECT 1 FROM transport_operation WHERE protocol='imap' AND operation IS NULL AND NOT header_reserved")).rowCount){
    const destination=(await c.query("SELECT slot FROM transport_operation WHERE protocol='imap' AND NOT header_reserved AND (operation IS NULL OR operation_purpose='header') ORDER BY slot LIMIT 1 FOR UPDATE")).rows[0];
    if(!destination)throw new HttpError(503,'transport_busy');
    await c.query("UPDATE transport_operation SET header_reserved=false WHERE protocol='imap' AND slot=$1",[reserved[0].slot]);
    await c.query("UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=$1",[destination.slot]);
    if((await c.query("SELECT slot FROM transport_operation WHERE protocol='imap' AND header_reserved")).rows.length!==1)throw new HttpError(503,'transport_busy');
   }
  }
  const free=(await c.query('SELECT slot FROM transport_operation WHERE protocol=$1 AND operation IS NULL AND ($2::boolean=false OR NOT header_reserved) ORDER BY header_reserved DESC,slot LIMIT 1 FOR UPDATE',[protocol,purpose==='body'])).rows[0];if(!free)throw new HttpError(503,'transport_busy');
  const result={protocol,slot:free.slot,operation:randomUUID(),ownerProcess:randomUUID(),ownerHost:hostname(),tenant,mailbox,...(purpose?{purpose}:{})};
  await c.query(`UPDATE transport_operation SET operation=$3,tenant_id=$4,mailbox_id=$5,owner_process=$6,owner_host=$7,expires_at=clock_timestamp()+interval '120 seconds',operation_purpose=$8 WHERE protocol=$1 AND slot=$2`,[protocol,result.slot,result.operation,tenant,mailbox,result.ownerProcess,result.ownerHost,protocol==='imap'?(purpose??'header'):null]);owners.set(result,{child:null,sealed:false,consumed:false});return Object.freeze(result);
}
export function consumePreadmittedSlot(slot:TransportSlot,tenant:string,mailbox:string){
 const owner=owners.get(slot);if(!owner||owner.sealed||owner.child||owner.consumed||slot.protocol!=='imap'||slot.tenant!==tenant||slot.mailbox!==mailbox)throw new HttpError(403,'owner_unproved');owner.consumed=true;return slot;
}
// Only a registered owner which NEVER bound a child can dispose an unused reservation.
export async function releaseUnusedTransportSlot(pool:Pool,slot:TransportSlot){
 const owner=owners.get(slot);if(!owner||owner.child||owner.sealed&&!owner.unusedProof)return false;
 owner.unusedProof??=closedOwnerProof(slot);
 const released=await releaseTransportSlot(pool,owner.unusedProof);if(released)delete owner.unusedProof;return released;
}
// A proof is an unforgeable in-process closure created by the exact child lifetime owner.
const proofs=new WeakMap<object,TransportSlot>();
export function bindTransportChild(slot:TransportSlot,child:ChildProcess){const owner=owners.get(slot);if(!owner||owner.sealed||owner.child||!(child instanceof ChildProcess))throw new HttpError(403,'owner_unproved');owner.child=child;}
export function closedOwnerProof(slot:TransportSlot){const owner=owners.get(slot);if(!owner||owner.child&&owner.child.exitCode===null&&owner.child.signalCode===null)throw new HttpError(403,'closure_unproved');owner.sealed=true;const proof={};proofs.set(proof,slot);return proof;}
export async function releaseTransportSlot(pool:Pool,proof:object) {
 const s=proofs.get(proof);if(!s)throw new HttpError(403,'closure_unproved');
 const result=await eligibilityTransaction(pool,c=>c.query(`UPDATE transport_operation SET operation=NULL,tenant_id=NULL,mailbox_id=NULL,owner_process=NULL,owner_host=NULL,expires_at=NULL,operation_purpose=NULL WHERE protocol=$1 AND slot=$2 AND operation=$3 AND owner_process=$4 AND owner_host=$5`,[s.protocol,s.slot,s.operation,s.ownerProcess,s.ownerHost]));
 if(result.rowCount)proofs.delete(proof);return result.rowCount===1;
}
