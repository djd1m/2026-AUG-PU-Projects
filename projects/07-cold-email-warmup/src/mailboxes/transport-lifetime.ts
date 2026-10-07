import { fork,type ChildProcess } from 'node:child_process';
import type { Pool } from 'pg';
import { bindTransportChild,closedOwnerProof,releaseTransportSlot,type TransportSlot } from './transport-slots.js';
export interface ChildRequest {kind:'smtp'|'snapshot'|'read'|'body_metadata'|'body_text';input:unknown;message?:unknown;allowlist:[string,number][];validity?:string;cursor?:number;horizon?:number;uid?:number;deadline?:number;fixture?:{ca:string;address:string;smtp465:number;smtp587:number;imap993:number}}
// Only the runtime composition root creates planned process-drain reasons.
const drains=new WeakSet<object>();
export function createProcessDrainReason():object {const reason=Object.freeze({});drains.add(reason);return reason;}
const interrupted=new WeakMap<object,{slot:TransportSlot;kind:'body_metadata'|'body_text';validity:string|undefined;uid:number|undefined}>();
export function consumeInterruptedBody(error:unknown,slot:TransportSlot){
 if(typeof error!=='object'||error===null)return null;
 const proof=interrupted.get(error);interrupted.delete(error);
 return proof?.slot===slot?proof:null;
}
const pending=new Map<string,object>();
export async function retryClosedSlots(pool:Pool){for(const [operation,proof] of pending){try{await releaseTransportSlot(pool,proof);pending.delete(operation);}catch{/* Occupancy remains fail closed. */}}}
async function confirmExit(child:ChildProcess,exit:Promise<void>){
 if(child.exitCode!==null||child.signalCode!==null)return;
 child.kill('SIGTERM');let timer:NodeJS.Timeout|undefined;
 try{await Promise.race([exit,new Promise<void>(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{if(timer)clearTimeout(timer);}
 if(child.exitCode!==null||child.signalCode!==null)return;
 child.kill('SIGKILL');try{await Promise.race([exit,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('cleanup_blocked')),5000);})]);}finally{if(timer)clearTimeout(timer);}
}
export async function runTransportChild<T>(pool:Pool,slot:TransportSlot,request:ChildRequest,signal?:AbortSignal):Promise<T>{
 if(request.deadline!==undefined&&(!Number.isFinite(request.deadline)||request.deadline<=Date.now()))throw new Error('transport_timeout');
 const child=fork(new URL(import.meta.url.endsWith('.ts')?'./transport-child.ts':'./transport-child.js',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
 bindTransportChild(slot,child);
 const exit=new Promise<void>(resolve=>child.once('exit',()=>resolve()));let timer:NodeJS.Timeout|undefined;let abort:()=>void=()=>{};let result:T|undefined;let failed=false,failureCode='transport_child_failed';let started=false,drainError:Error|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{
   child.once('error',()=>{failed=true;reject(new Error('transport_child_failed'));});
   child.on('message',(value:unknown)=>{const v=value as {ok:boolean;result?:T;code?:string};if(!v||v.ok!==true){failed=true;failureCode=v?.code==='timeout'?'transport_timeout':v?.code==='cancelled'?'transport_cancelled':'transport_child_failed';return;}result=v.result;});
   child.once('exit',code=>{if(code!==0||failed||result===undefined)reject(new Error(failureCode));else resolve();});
   abort=()=>{const error=new Error('transport_cancelled');if(started&&signal&&typeof signal.reason==='object'&&signal.reason!==null&&drains.has(signal.reason))drainError=error;reject(error);};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(new Error('transport_timeout')),request.kind==='smtp'?95000:request.kind.startsWith('body_')?Math.max(1,Math.min(5000,(request.deadline??Date.now()+5000)-Date.now())):35000);
   if(signal?.aborted){reject(new Error('transport_cancelled'));return;}child.send(request);started=true;
  });return result!;
 }catch(error){if(error!==drainError)drainError=undefined;throw error;}finally{
  if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);
  await confirmExit(child,exit);await exit;
  const proof=closedOwnerProof(slot);pending.set(slot.operation,proof);try{if(await releaseTransportSlot(pool,proof)){pending.delete(slot.operation);if(drainError&&slot.protocol==='imap'&&slot.purpose==='body'&&(request.kind==='body_metadata'||request.kind==='body_text'))interrupted.set(drainError,{slot,kind:request.kind,validity:request.validity,uid:request.uid});}}catch{/* Exact child exit proof retained, at most six occupied slots. */}
 }
}
