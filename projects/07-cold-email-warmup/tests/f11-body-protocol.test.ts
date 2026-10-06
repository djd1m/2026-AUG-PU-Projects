import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readImapBodyStage } from '../src/mailboxes/transport-channel.js';
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
