from pathlib import Path
r=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup')
p=r/'src/mailboxes/transport-slots.ts';s=p.read_text().replace('consumed:boolean}>','consumed:boolean;unusedProof?:object}>').replace("if(!owner||owner.child||owner.sealed)return false;\n return releaseTransportSlot(pool,closedOwnerProof(slot));", "if(!owner||owner.child||owner.sealed&&!owner.unusedProof)return false;\n owner.unusedProof??=closedOwnerProof(slot);\n const released=await releaseTransportSlot(pool,owner.unusedProof);if(released)delete owner.unusedProof;return released;");p.write_text(s)
p=r/'tests/f10-runtime-unit.test.ts';s=p.read_text();s+='''

test('preadmitted slots are one-use and unused cleanup refuses a child-bound owner',async()=>{
 const {acquireTransportSlotInTransaction,consumePreadmittedSlot,releaseUnusedTransportSlot,bindTransportChild}=await import('../src/mailboxes/transport-slots.js');
 const {ChildProcess}=await import('node:child_process');let released=0;
 const client={async query(sql:string){if(sql.startsWith('SELECT slot'))return {rows:[{slot:1}],rowCount:1};if(sql.includes('SET operation=NULL'))released++;return {rows:[],rowCount:sql.startsWith('SELECT')?0:1};},release(){}};
 const pool={async connect(){return client;}} as unknown as import('pg').Pool;
 const slot=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');
 assert.throws(()=>consumePreadmittedSlot({...slot},'tenant','mailbox'));
 assert.throws(()=>consumePreadmittedSlot(slot,'other','mailbox'));
 consumePreadmittedSlot(slot,'tenant','mailbox');assert.throws(()=>consumePreadmittedSlot(slot,'tenant','mailbox'));
 assert.equal(await releaseUnusedTransportSlot(pool,slot),true);assert.equal(released,1);
 const bound=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');bindTransportChild(bound,new ChildProcess());assert.equal(await releaseUnusedTransportSlot(pool,bound),false);assert.equal(released,1);
});

test('unused reservation cleanup retains exact proof after a database release failure',async()=>{
 const {acquireTransportSlotInTransaction,releaseUnusedTransportSlot}=await import('../src/mailboxes/transport-slots.js');let failed=false,attempts=0;
 const client={async query(sql:string){if(sql.startsWith('SELECT slot'))return {rows:[{slot:1}],rowCount:1};if(sql.includes('SET operation=NULL')){attempts++;if(!failed){failed=true;throw new Error('database fault');}}return {rows:[],rowCount:sql.startsWith('SELECT')?0:1};},release(){}};
 const slot=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');const pool={async connect(){return client;}} as unknown as import('pg').Pool;
 await assert.rejects(releaseUnusedTransportSlot(pool,slot),/database fault/);assert.equal(await releaseUnusedTransportSlot(pool,slot),true);assert.equal(attempts,2);
});
''';p.write_text(s)
p=r/'tests/f10-runtime-integration.test.ts';s=p.read_text();s+='''

test('native poll claim reserves physical admission atomically across competing processes',async()=>{
 const {pool,boxes}=await runtimeFixture();const {consumePreadmittedSlot,releaseUnusedTransportSlot}=await import('../src/mailboxes/transport-slots.js');
 try{
  const authority=async()=>{};const stores=Array.from({length:5},()=>new RuntimeStore(pool,authority));await stores[0]!.maintenance();
  await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-CASE WHEN mailbox_id=$1 THEN interval '1 minute' ELSE interval '2 minutes' END WHERE kind='poll'",[boxes[4]]);
  const before=(await pool.query("SELECT mailbox_id,due_at FROM runtime_due WHERE kind='poll'")).rows;
  const first=await Promise.all(stores.slice(0,4).map(s=>s.claim('poll')));assert.ok(first.every(Boolean));assert.equal(new Set(first.map(c=>c!.mailbox_id)).size,4);assert.ok(first.every(c=>c!.mailbox_id!==boxes[4]));
  assert.equal((await pool.query("SELECT count(*) FROM transport_operation WHERE protocol='imap' AND operation IS NOT NULL")).rows[0].count,'4');
  const ranks=(await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;assert.equal(await stores[4]!.claim('poll'),null);assert.deepEqual((await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,ranks,'full physical capacity commits no turn or claim');
  const released=first[2]!;await stores[2]!.cancel(released);const restart=new RuntimeStore(pool,authority),e=await restart.claim('poll');assert.ok(e);assert.equal(e.mailbox_id,boxes[4],'later due E receives released slot before any old second selection');const slot=restart.pollAdmission(e)!.slot!;assert.equal(slot.mailbox,e.mailbox_id);consumePreadmittedSlot(slot,e.tenant_id,e.mailbox_id);assert.throws(()=>consumePreadmittedSlot(slot,e.tenant_id,e.mailbox_id));await restart.cancel(e);
  for(let i=0;i<4;i++)if(i!==2)await stores[i]!.cancel(first[i]!);
  assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  assert.deepEqual((await pool.query("SELECT mailbox_id,due_at FROM runtime_due WHERE kind='poll'")).rows,before,'unsatisfied original due survives cleanup and restart');
  const denied=new RuntimeStore(pool,async()=>{throw new (await import('../src/errors.js')).HttpError(503,'transport_denied');});const claim=await denied.claim('poll');assert.ok(claim);assert.equal(denied.pollAdmission(claim)!.reason,'authority_denied');await denied.finish(claim,'authority_denied');assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  // Force a real SQL transaction to fail AFTER its physical reservation update.
  const wrapped={async connect(){const c=await pool.connect();return {query:async(sql:string,args?:unknown[])=>{if(sql.startsWith("UPDATE runtime_due SET state='claimed'"))throw new Error('injected claim failure');return c.query(sql,args);},release:()=>c.release()};}} as unknown as import('pg').Pool;
  const rollbackRanks=(await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;
  await assert.rejects(new RuntimeStore(wrapped,authority).claim('poll'),/injected claim failure/);assert.deepEqual((await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,rollbackRanks);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  assert.equal(await releaseUnusedTransportSlot(pool,slot),false);
 }finally{await pool.end();}
});
''';p.write_text(s)
