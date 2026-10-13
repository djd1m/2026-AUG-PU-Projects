import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseCampaign,render } from '../src/campaigns/input.js';
import { sealRecipient,openRecipient,recipientDigest } from '../src/campaigns/store.js';
import { encryptCredentials,decryptCredentials } from '../src/mailboxes/crypto.js';
const step={subject:'Hello {{firstName}}',body:'For {{company}}',delayHours:24};
const recipient={address:'person@example.test',fields:{firstName:'Ada',company:'<img src=x onerror=alert(1)>'}};
test('A1 canonical bounds, missing fields, source/header injection and escaped preview',()=>{
 const value=parseCampaign({steps:[step],recipients:[recipient]});const output=render(value.steps[0]!,recipient.fields);
 assert.equal(output.body,'For '+recipient.fields.company);assert.match(output.html,/&lt;img/);assert.ok(!output.html.includes('<img'));
 const valid={steps:[step],recipients:[recipient]};
 for(const input of [
  {...valid,steps:Array(6).fill(step)}, {...valid,recipients:Array.from({length:101},(_,i)=>({...recipient,address:`r${i}@example.test`}))},
  {...valid,steps:[{...step,delayHours:23.999}]}, {...valid,steps:[{...step,subject:'X\r\nBcc:x'}]},
  {...valid,steps:[{...step,subject:undefined}]}, {...valid,steps:[{...step,body:'<script>x</script>'}]},
  {...valid,steps:[{...step,body:'{{unknown}}'}]}, {...valid,recipients:[{...recipient,fields:{}}]},
  {...valid,recipients:[{...recipient,address:'x@example.test\r\nBcc:y'}]},
  {...valid,recipients:[{...recipient,fields:{firstName:'A\nB',company:'c'}}]}
 ]) assert.throws(()=>parseCampaign(input));
 assert.equal(parseCampaign({steps:Array(5).fill(step),recipients:[recipient]}).steps.length,5);
});
test('A2 versioned enrollment AEAD purpose, tenant/id substitution and separately keyed digest',()=>{
 const ring={activeVersion:'v1',keys:new Map([['v1',randomBytes(32)]])};const tenant=randomUUID(),id=randomUUID();
 const sealed=sealRecipient(recipient.address,tenant,id,ring);assert.equal(openRecipient(sealed,tenant,id,ring),recipient.address);
 assert.ok(!JSON.stringify(sealed).includes(recipient.address));
 assert.throws(()=>openRecipient(sealed,randomUUID(),id,ring));assert.throws(()=>openRecipient(sealed,tenant,randomUUID(),ring));
 assert.throws(()=>decryptCredentials(sealed,tenant,id,ring));
 assert.throws(()=>openRecipient(encryptCredentials(recipient.address,tenant,id,ring),tenant,id,ring));
 const key=randomBytes(32);assert.equal(recipientDigest(recipient.address,key),recipientDigest(recipient.address.toUpperCase(),key));
 assert.notEqual(recipientDigest(recipient.address,key),recipientDigest(recipient.address,randomBytes(32)));
});
