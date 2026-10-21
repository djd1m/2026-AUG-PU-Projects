from pathlib import Path
p=Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/tests/f10-runtime-protocol.test.ts')
t=p.read_text().replace('acquireTransportSlot,bindTransportChild','acquireTransportSlot,acquireTransportSlotInTransaction,releaseUnusedTransportSlot,bindTransportChild')
t+='''
// Real PG allocation counterproofs; every reservation is released by its exact owner.
test('F11 durable purpose admission rotates reservation and conservatively holds unknown owners',async()=>{
 const c=await runtimeFixture(9),slots:TransportSlot[]=[];
 const body=(mailbox:string)=>import('../src/consent/transaction.js').then(({eligibilityTransaction})=>eligibilityTransaction(c.pool,client=>acquireTransportSlotInTransaction(client,'imap',c.tenant,mailbox,'body')));
 const snapshot=()=>c.pool.query("SELECT slot,operation,owner_process,owner_host,tenant_id,mailbox_id,operation_purpose,header_reserved FROM transport_operation WHERE protocol='imap' ORDER BY slot").then(r=>r.rows);
 const clear=async()=>{for(const s of slots.splice(0))await releaseUnusedTransportSlot(c.pool,s);};
 try{
  for(let freeSlot=1;freeSlot<=4;freeSlot++){
   await c.pool.query("UPDATE transport_operation SET header_reserved=false WHERE protocol='imap'");await c.pool.query("UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=$1",[freeSlot]);
   // Reserve all four with known HEADER purposes, then release the chosen row.
   const headers=[];for(let i=0;i<4;i++){const s=await acquireTransportSlot(c.pool,'imap',c.tenant,c.boxes[i]!);slots.push(s);headers.push(s);}
   const free=headers.find(s=>s.slot===freeSlot)!;assert.equal(await releaseUnusedTransportSlot(c.pool,free),true);
   const before=await snapshot(),s=await body(c.boxes[4]!);slots.push(s);assert.equal(s.slot,freeSlot);
   const after=await snapshot();assert.equal(after.filter(r=>r.header_reserved).length,1);assert.equal(after.find(r=>r.slot===freeSlot).operation_purpose,'body');assert.equal(after.find(r=>r.slot===freeSlot).header_reserved,false);
   for(const row of before.filter(r=>r.operation))assert.deepEqual({...after.find(r=>r.slot===row.slot),header_reserved:row.header_reserved},row,'rotation leaves exact physical header identity intact');
   await clear();
  }
  // Two bodies plus an unknown predecessor consume all three potential BODY lanes.
  slots.push(await body(c.boxes[0]!),await body(c.boxes[1]!));const unknown=await acquireTransportSlot(c.pool,'imap',c.tenant,c.boxes[2]!);slots.push(unknown);
  await c.pool.query("UPDATE transport_operation SET operation_purpose=NULL,expires_at=clock_timestamp()-interval '1 day' WHERE operation=$1",[unknown.operation]);
  const held=await snapshot();await assert.rejects(body(c.boxes[3]!),/transport_busy/);assert.deepEqual(await snapshot(),held,'unknown age never reclaims purpose or physical capacity');await clear();
  // Independent FIRST transactions compete for the same physical/body budget.
  const concurrent=await Promise.allSettled(c.boxes.slice(0,4).map(body));for(const r of concurrent)if(r.status==='fulfilled')slots.push(r.value);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,3);assert.equal((await snapshot()).filter(r=>r.operation_purpose==='body').length,3);
  const header=await acquireTransportSlot(c.pool,'imap',c.tenant,c.boxes[5]!);slots.push(header);assert.equal((await snapshot()).filter(r=>r.operation).length,4);await assert.rejects(body(c.boxes[6]!),/transport_busy/);await clear();
  // Invalid reservation is fail closed; uniqueness rejects multiple markers.
  await c.pool.query("UPDATE transport_operation SET header_reserved=false WHERE protocol='imap'");await assert.rejects(body(c.boxes[0]!),/transport_busy/);
  await c.pool.query("UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=4");await assert.rejects(c.pool.query("UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=1"));
  for(let i=0;i<3;i++)slots.push(await acquireTransportSlot(c.pool,'imap',c.tenant,c.boxes[i]!));
  const beforeRollback=await snapshot(),{eligibilityTransaction}=await import('../src/consent/transaction.js');
  await assert.rejects(eligibilityTransaction(c.pool,async client=>{await acquireTransportSlotInTransaction(client,'imap',c.tenant,c.boxes[4]!,'body');throw Error('forced_after_rotation');}),/forced_after_rotation/);assert.deepEqual(await snapshot(),beforeRollback,'rotation and allocation roll back together');await clear();
  // A forged closure cannot clear purpose; stale identity cannot clear replacement.
  const first=await body(c.boxes[0]!);slots.push(first);await assert.rejects(releaseTransportSlot(c.pool,{}),/closure_unproved/);assert.equal(await releaseUnusedTransportSlot(c.pool,first),true);
  const replacement=await body(c.boxes[0]!);slots.push(replacement);assert.equal(await releaseTransportSlot(c.pool,closedOwnerProof(first)),false);assert.equal((await snapshot()).find(r=>r.operation===replacement.operation).operation_purpose,'body');await clear();
  assert.equal((await snapshot()).filter(r=>r.header_reserved).length,1);assert.ok((await snapshot()).every(r=>r.operation===null&&r.operation_purpose===null));
  // Actual incomplete and due header guards remain in force.
  await c.pool.query('INSERT INTO mailbox_poll(mailbox_id,scan_complete) VALUES($1,false)',[c.boxes[0]]);await assert.rejects(body(c.boxes[0]!),/transport_busy/);
 }finally{await clear();await c.pool.end();}
});
'''
p.write_text(t)
