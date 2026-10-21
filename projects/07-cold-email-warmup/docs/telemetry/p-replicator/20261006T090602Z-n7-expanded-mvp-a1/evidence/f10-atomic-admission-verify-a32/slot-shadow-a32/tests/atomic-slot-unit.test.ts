import assert from 'node:assert/strict';
import {test} from 'node:test';
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
