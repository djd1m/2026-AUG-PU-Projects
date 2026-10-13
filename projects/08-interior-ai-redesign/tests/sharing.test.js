import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSharing, validatePublication } from '../web/sharing.js';
import { publicPage, publicList } from '../web/public-pages.js';
import { sharingFixture, publication } from './sharing-fixtures.js';
const denied=async promise=>{try{await promise;return false;}catch(e){if(e.status!==404)throw e;return true;}};
test('PUBLIC-01 exact Unicode context/description, consent and style boundaries',()=>{
  for(const source_context of ['x','😀'.repeat(160)])for(const description of ['d'.repeat(40),'d'.repeat(2000)])assert.doesNotThrow(()=>validatePublication(publication({source_context,description})));
  for(const input of [publication({publish:false}),publication({publish:undefined}),publication({source_context:''}),publication({source_context:'x'.repeat(161)}),
    publication({description:'d'.repeat(39)}),publication({description:'d'.repeat(2001)}),publication({style:'unknown'}),publication({description:' '.repeat(40)})])assert.throws(()=>validatePublication(input));
});
test('owner boundary, strict public gate, byte bindings, explicit publication and revocation',async t=>{
  const f=await sharingFixture();try {
    const s=createSharing(f.db,f.config),key=randomUUID(),other=randomUUID();
    await t.test('SHARE-03 targeted cross-owner guard',async()=>{
      let status=200;try{await s.attempt(other,f.id,{event_key:key,mode:'download'});}catch(e){status=e.status;}
      assert.equal(status,404,'SHARE-03 cross-owner composite must return 404');
    });
    await t.test('prepare ignores removeBadge and wrong owner cannot read artifact',async()=>{
      const a=await s.attempt(f.owner,f.id,{event_key:key,mode:'download',removeBadge:true});assert.match(a.artifact,/composite\/download/);
      const image=await s.ownerComposite(f.owner,f.id,'download',key);assert.ok(image.data.length>0);
      assert.equal(await denied(s.ownerComposite(other,f.id,'download',key)),true);
      const locks=f.state.commands.filter(q=>q.includes('FOR UPDATE'));assert.ok(locks[0].includes('FROM account'));assert.ok(locks[1].includes('FROM job'));
    });
    await t.test('accepted record XSS is escaped and public metadata has no private fields',async()=>{
      const v=await s.publish(f.owner,f.id,publication({source_context:'<img src=x onerror=alert(1)>',description:'<script>alert("x")</script> literal useful text long enough.'}));
      const read=await s.publicRead(v.token);assert.ok(read.image.data.length>0);const html=publicPage(read);
      assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('AI redesign'));
      for(const value of [f.owner,f.id,f.uploadId,f.row.output_key,'@example','/api/uploads','/result'])assert.ok(!html.includes(value));
      const list=await s.list();assert.equal(list.items.length,1);assert.ok(!JSON.stringify(list).includes(f.id));assert.ok(publicList(list).includes('&lt;img'));
      await s.revoke(f.owner,f.id);assert.equal(await denied(s.publicRead(v.token)),true);assert.equal((await s.list()).items.length,0);
      const republished=await s.publish(f.owner,f.id,publication());assert.notEqual(republished.token,v.token);assert.equal(await denied(s.publicRead(v.token)),true);
      f.state.row.quality='rejected';assert.equal(await denied(s.publicRead(republished.token)),true);assert.equal((await s.list()).items.length,0);
      f.state.row.quality='accepted';f.state.row.deleted_at=new Date();assert.equal(await denied(s.publicRead(republished.token)),true);f.state.row.deleted_at=null;
    });
    await t.test('unverified or missing privileged evidence cannot publish; private unverified stays unverified',async()=>{
      f.state.row.quality='unverified';assert.equal(await denied(s.publish(f.owner,f.id,publication())),true);
      const a=await s.attempt(f.owner,f.id,{event_key:randomUUID(),mode:'native'});assert.equal(a.quality,'unverified');
      f.state.row.quality='accepted';f.state.row.reviewed=false;assert.equal(await denied(s.publish(f.owner,f.id,publication())),true);f.state.row.reviewed=true;
      f.state.row.canonical_evidence={...f.state.row.canonical_evidence,seed:9};assert.equal(await denied(s.publish(f.owner,f.id,publication())),true);f.state.row.canonical_evidence=f.row.canonical_evidence;
      await writeFile(join(f.dir,'outputs',f.row.output_key),'changed');assert.equal(await denied(s.ownerComposite(f.owner,f.id,'download',key)),true);
    });
  }finally{await f.cleanup();}
});
test('fixture is privately labelled and always denied publication',async()=>{
  const f=await sharingFixture('fixture');try {
    const s=createSharing(f.db,f.config);f.state.account.badge_free_entitlement=true;
    const a=await s.attempt(f.owner,f.id,{event_key:randomUUID(),mode:'native'});assert.equal(a.demo,true);assert.equal(a.quality,'unverified');
    assert.equal(await denied(s.publish(f.owner,f.id,publication())),true);
  }finally{await f.cleanup();}
});
test('PAY-05 targeted final hold guard on cached paid bytes and public reads',async()=>{
  const f=await sharingFixture();try {
    f.state.account.badge_free_entitlement=true;let race=false;
    const s=createSharing(f.db,f.config,{afterPrepare:()=>{if(race)f.state.account.billing_hold=true;}});
    const key=randomUUID();await s.attempt(f.owner,f.id,{event_key:key,mode:'download'});
    await s.ownerComposite(f.owner,f.id,'download',key);race=true;
    const blocked=await denied(s.ownerComposite(f.owner,f.id,'download',key));
    assert.equal(blocked,true,'PAY-05 final hold must reject cached paid composite');
    race=false;const branded=await s.ownerComposite(f.owner,f.id,'download',key);assert.ok(branded.data.length);
    assert.equal(await denied(s.publish(f.owner,f.id,publication())),true);
  }finally{await f.cleanup();}
});
test('share attempts/outcomes/download events are distinct, replay safe and native resolve is browser reported',async()=>{
  const f=await sharingFixture();try {
    const s=createSharing(f.db,f.config);
    for(const outcome of ['resolved','abort','error','unavailable']) {
      const event_key=randomUUID();await s.attempt(f.owner,f.id,{event_key,mode:'native'});await s.attempt(f.owner,f.id,{event_key,mode:'native'});
      if(outcome==='resolved') {
        await assert.rejects(s.outcome(f.owner,f.id,{event_key,outcome}),e=>e.status===409);
        await s.ownerComposite(f.owner,f.id,'native',event_key);
      }
      await s.outcome(f.owner,f.id,{event_key,outcome});await s.outcome(f.owner,f.id,{event_key,outcome});
    }
    const event_key=randomUUID();await s.attempt(f.owner,f.id,{event_key,mode:'download'});
    await assert.rejects(s.outcome(f.owner,f.id,{event_key,outcome:'resolved'}),e=>e.status===409);
    const image=await s.ownerComposite(f.owner,f.id,'download',event_key);
    assert.equal([...f.state.events.values()].filter(e=>e==='export_delivered').length,0);
    await image.delivered();await image.delivered();
    assert.equal([...f.state.events.values()].filter(e=>e==='share_attempt').length,5);
    assert.equal([...f.state.events.values()].filter(e=>e==='share_completed').length,1);
    assert.equal([...f.state.events.values()].filter(e=>e==='export_delivered').length,1);
    await assert.rejects(s.attempt(f.owner,f.id,{event_key,mode:'native'}),e=>e.status===409);
    for(const limit of [0,21,1.5])await assert.rejects(s.list({limit}),e=>e.status===400);
    await assert.rejects(s.list({before:'../../raw'}),e=>e.status===400);
  }finally{await f.cleanup();}
});
test('bounded parallel preparation holds no SQL locks; public list repeats final consent check',async()=>{
  const f=await sharingFixture();try {
    let release,ready;const gate=new Promise(resolve=>{release=resolve;}),prepared=new Promise(resolve=>{ready=resolve;});let count=0;
    const s=createSharing(f.db,f.config,{afterPrepare:async()=>{if(++count===2)ready();await gate;}});
    const attempts=[s.attempt(f.owner,f.id,{event_key:randomUUID(),mode:'native'}),s.attempt(f.owner,f.id,{event_key:randomUUID(),mode:'native'})];
    await prepared;
    assert.equal(f.state.commands.some(sql=>sql.includes('FOR UPDATE')),false,'image work must not hold SQL locks');
    await assert.rejects(s.attempt(f.owner,f.id,{event_key:randomUUID(),mode:'native'}),e=>e.status===503);
    release();await Promise.all(attempts);
    const normal=createSharing(f.db,f.config);const v=await normal.publish(f.owner,f.id,publication());
    const racing=createSharing(f.db,f.config,{afterPrepare:()=>{f.state.shares.get(v.token).published=false;f.state.shares.get(v.token).revoked_at=new Date();}});
    assert.equal((await racing.list()).items.length,0,'list delivery must repeat consent after preparation');
  }finally{await f.cleanup();}
});
