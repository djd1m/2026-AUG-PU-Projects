import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { readImapBodyStage,TransportFailure } from '../src/mailboxes/transport-channel.js';
import { consumeNativeBodyProof } from '../src/replies/adapter.js';
import { parsePlainBody } from '../src/replies/body.js';
import { bodyFixture,bodyInput,bodyAllowlist } from './f11-body-fixture.js';
export async function bodyProtocolWitness(){
 for(const size of [32768,32769]){const f=await bodyFixture({body:Buffer.alloc(size,65)});try{
  const metadata=await readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_metadata',new AbortController().signal,f.connector);
  const bytes=await readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',new AbortController().signal,f.connector);
  assert.equal(bytes.length,size);assert.equal(parsePlainBody(metadata,bytes).kind,size===32768?'text':'hold');assert.equal(f.commands.filter(c=>c.includes('BODY.PEEK[TEXT]<0.32769>')).length,1);assert.equal(f.peak,1);assert.ok(!f.commands.some(c=>/\b(SELECT|STORE|APPEND)\b/.test(c)));
 }finally{await f.close();}}
 for(const option of [{declared:32770},{wrongUid:true},{validity:'2'}]){const f=await bodyFixture(option);try{await assert.rejects(readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',new AbortController().signal,f.connector));if(option.validity)assert.equal(f.commands.filter(c=>c.includes('FETCH')).length,0);}finally{await f.close();}}
 assert.throws(()=>consumeNativeBodyProof({identity:{},bytes:Buffer.from('forged')}));
}
test('F11 native body read-only UID sentinel and unforgeable proof',bodyProtocolWitness);
test('F11 body native cancellation closes physical socket',async()=>{const f=await bodyFixture({stall:true}),abort=new AbortController();try{const pending=readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',abort.signal,f.connector);setTimeout(()=>abort.abort(),40);await assert.rejects(pending);await new Promise(r=>setTimeout(r,25));assert.equal(f.sockets.size,0);}finally{await f.close();}});

test('F11 fixed native deadline denies zero sockets and truncates a slow phase without renewing',async()=>{
 const expired=await bodyFixture();try{await assert.rejects(readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',new AbortController().signal,expired.connector,Date.now()-1));assert.equal(expired.commands.length,0);assert.equal(expired.peak,0);}finally{await expired.close();}
 const slow=await bodyFixture({phaseDelayMs:200}),end=Date.now()+80;try{await assert.rejects(readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',new AbortController().signal,slow.connector,end));await new Promise(r=>setTimeout(r,25));assert.equal(slow.sockets.size,0);assert.ok(Date.now()-end<200);}finally{await slow.close();}
});

test('F11 two slow native phases cannot both fit a single absolute five-second window',async()=>{
 const f=await bodyFixture({phaseDelayMs:2800}),end=Date.now()+5000;try{
  const metadata=await readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_metadata',new AbortController().signal,f.connector,end);assert.ok(metadata.length>0);
  await new Promise<void>(r=>setImmediate(r));
  await assert.rejects(readImapBodyStage(bodyInput,bodyAllowlist,'1',1,'body_text',new AbortController().signal,f.connector,end),error=>error instanceof TransportFailure&&error.code==='timeout');await new Promise(r=>setTimeout(r,25));assert.equal(f.sockets.size,0);assert.ok(Date.now()-end<300);assert.equal(f.commands.filter(c=>c.includes('BODY.PEEK[TEXT]')).length,1);console.info(JSON.stringify({witness:'two_phase_5s_negative',end,errorCode:'timeout',wire:f.wire}));
 }finally{await f.close();}
});

export async function twoPhaseWindowWitness(){
 const f=await bodyFixture({phaseDelayMs:2800}),start=Date.now(),end=start+12000,phases:unknown[]=[];
 const phase=async(kind:'body_metadata'|'body_text')=>{const begun={utc:new Date().toISOString(),monotonicMs:performance.now()};const bytes=await readImapBodyStage(bodyInput,bodyAllowlist,'1',1,kind,new AbortController().signal,f.connector,end);const finished={utc:new Date().toISOString(),monotonicMs:performance.now()};phases.push({kind,begun,finished,elapsedMs:finished.monotonicMs-begun.monotonicMs});assert.ok(finished.monotonicMs-begun.monotonicMs<=5000);return bytes;};
 try{const metadata=await phase('body_metadata');const yielded={utc:new Date().toISOString(),monotonicMs:performance.now()};await new Promise<void>(r=>setImmediate(r));const bytes=await phase('body_text');assert.equal(parsePlainBody(metadata,bytes).kind,'text');assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,25));assert.equal(f.sockets.size,0);assert.equal(f.peak,1);console.info(JSON.stringify({witness:'two_phase_12s_positive',start,end,yielded,phases,wire:f.wire}));}finally{await f.close();}
}
test('F11 admitted twelve-second window completes both legal 2800ms native phases',twoPhaseWindowWitness);
