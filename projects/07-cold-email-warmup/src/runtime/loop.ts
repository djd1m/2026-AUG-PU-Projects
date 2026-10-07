import { setTimeout as delay,setImmediate as yieldTurn } from 'node:timers/promises';
import type { CaptureAdmission } from '../replies/context-store.js';
import type { RuntimeClaim,RuntimeKind,RuntimeReason } from './store.js';
import { RuntimeStore,runtimeFailure } from './store.js';
export interface RuntimeOutcome {reason?:RuntimeReason;satisfied?:boolean}
export type RuntimeOperation=(claim:RuntimeClaim,signal:AbortSignal)=>Promise<RuntimeOutcome>;
// Each finite lane owns and joins exactly one operation before acquiring another.
export async function runRuntime(store:RuntimeStore,operations:Record<RuntimeKind,RuntimeOperation>&{maintenance?:()=>Promise<unknown>;body?:(signal:AbortSignal,admission?:CaptureAdmission)=>Promise<boolean>},signal:AbortSignal,once=false){
 const external=signal,internal=new AbortController();const stop=()=>internal.abort(external.reason);external.addEventListener('abort',stop,{once:true});if(external.aborted)stop();
 signal=internal.signal;
 const lane=async(kind:RuntimeKind)=>{do {
  if(signal.aborted)return;
  if(kind==='poll'&&operations.body&&await operations.body(signal)){if(once)return;try{await yieldTurn(undefined,{signal});}catch{return;}continue;}
  const claim=await store.claim(kind);if(!claim){if(kind==='poll'&&operations.body&&await operations.body(signal)){if(once)return;try{await yieldTurn(undefined,{signal});}catch{return;}continue;}if(once)return;try{await delay(1000,undefined,{signal});}catch{return;}continue;}
  if(signal.aborted){await store.cancel(claim);return;}
  let result:RuntimeOutcome;
  try{result=await operations[kind](claim,signal);}catch(error){const reason=runtimeFailure(error);if(reason===null){internal.abort();throw error;}result={reason};}
  if(signal.aborted){await store.cancel(claim,result.reason);return;}
  let capture:CaptureAdmission|undefined;
  try{
   await store.finish(claim,result.reason,result.satisfied);
   capture=store.takeCaptureAdmission(claim);
   try{await yieldTurn(undefined,{signal});}catch{return;}
   if(capture&&operations.body)await operations.body(signal,capture);
  }finally{capture??=store.takeCaptureAdmission(claim);if(capture)await store.disposeCaptureAdmission(capture);}
 }while(!once&&!signal.aborted);};
 const maintenance=async()=>{if(once)return;do{try{await delay(5000,undefined,{signal});}catch{return;}if(signal.aborted)return;await store.maintenance();await operations.maintenance?.();}while(!signal.aborted);};
 try{await store.maintenance();await operations.maintenance?.();}catch(error){external.removeEventListener('abort',stop);throw error;}
 const owned=(operation:Promise<void>)=>operation.catch(e=>{internal.abort();throw e;});
 const joined=await Promise.allSettled([owned(maintenance()),...Array.from({length:4},()=>owned(lane('poll'))),...Array.from({length:2},()=>owned(lane('dispatch'))),owned(lane('pool'))]);
 external.removeEventListener('abort',stop);
 const failure=joined.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
}
