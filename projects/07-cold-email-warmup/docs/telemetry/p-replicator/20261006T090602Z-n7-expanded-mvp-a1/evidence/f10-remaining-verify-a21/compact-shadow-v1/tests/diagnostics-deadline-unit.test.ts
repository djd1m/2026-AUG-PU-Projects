import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { diagnose } from '../src/mailboxes/diagnostics.js';
import { diagnosticInput } from './diagnostics-fixture.js';
import { blockedFixture } from './diagnostics-deadline-fixture.js';
const allowlist=new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]);
test('actual phase deadlines and trickle close sockets listeners timers and settle once',async t=>{
 for(const phase of ['dns','connect','tls','greeting','auth','trickle'] as const)await t.test(phase,async()=>{
 const fixture=await blockedFixture(phase);const start=performance.now();try{
 let settlements=0;const result=await diagnose(diagnosticInput,allowlist,new AbortController().signal,fixture.connector).then(r=>{settlements++;return r;});
 const elapsed=performance.now()-start;assert.ok(elapsed>=9500&&elapsed<12000,phase+': elapsed='+elapsed);assert.equal(result.smtp.code,'timeout');assert.equal(settlements,1);
 fixture.release();await new Promise(r=>setTimeout(r,25));assert.equal(settlements,1);
 for(const c of fixture.channels)assert.deepEqual(c.resources(),{sockets:0,listeners:0,pending:0,timers:0,abortListeners:0});
 }finally{await fixture.close();}
 });
});
test('simultaneous abort peer completion and error cannot publish late success',async()=>{
 const fixture=await blockedFixture('auth');const controller=new AbortController();try{
 let settled=0;const result=diagnose(diagnosticInput,allowlist,controller.signal,fixture.connector).then(r=>{settled++;return r;});await fixture.started;controller.abort();fixture.release();const observed=await result;assert.equal(observed.smtp.code,'cancelled');assert.equal(settled,1);await new Promise(r=>setTimeout(r,25));assert.equal(settled,1);for(const c of fixture.channels)assert.equal(c.resources().listeners,0);
 }finally{await fixture.close();}
});
