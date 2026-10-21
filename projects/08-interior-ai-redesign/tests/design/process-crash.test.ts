import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {PgJobs} from '@n8/db/design';
import {freshDb} from '../helpers/db';
import {setup,live,clock} from './fixtures';
it('SC-US-008-4 actual killed worker after dispatch resumes as uncertain with holds and zero redispatch',async()=>{
 const db=await freshDb(),children:ChildProcess[]=[];try{
  const f=await setup(db.pool),time=clock(),jobs=new PgJobs(db.pool,{aiMode:'live',aiLive:live},time),preview=await jobs.preview(f.actor,f.project,1,f.input),job=await jobs.submit(f.actor,f.project,1,randomUUID(),f.input,preview.consentHash);
  const schema=(await db.pool.query('SHOW search_path')).rows[0].search_path;
  const start=(phase:string,now:string)=>{const child=fork(fileURLToPath(new URL('./crash-worker.fixture.mjs',import.meta.url)),[],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,NODE_ENV:'test',N8_TEST_SCHEMA:schema,N8_TEST_PHASE:phase,N8_TEST_NOW:now,N8_TEST_ACTOR:f.actor,N8_TEST_JOB:job.id}});children.push(child);return child;};
  const first=start('dispatch',time.now().toISOString());const [dispatched]=await once(first,'message',{signal:AbortSignal.timeout(8000)});expect(dispatched).toEqual({phase:'dispatched',calls:1});expect((await jobs.get(f.actor,job.id)).state).toBe('running');const exit=once(first,'exit');first.kill('SIGKILL');expect((await exit)[1]).toBe('SIGKILL');
  time.advance(46000);const restarted=start('restart',time.now().toISOString()),[proof]=await once(restarted,'message',{signal:AbortSignal.timeout(8000)});expect(proof).toMatchObject({phase:'restarted',swept:1,claimed:false,calls:0,state:{id:job.id,state:'uncertain',actualMicroUsd:null,creditState:'held'}});await once(restarted,'exit');
  expect((await db.pool.query('SELECT reserved_micro_usd::text held,settled_micro_usd::text spent FROM spend_budget ORDER BY scope')).rows).toEqual([{held:'100',spent:'0'},{held:'100',spent:'0'}]);expect((await db.pool.query('SELECT credits_available,credits_held FROM account WHERE id=$1',[f.actor])).rows[0]).toEqual({credits_available:29,credits_held:1});expect((await jobs.get(f.actor,job.id)).state).toBe('uncertain');
 }finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGKILL');await ended;}await db.close();}
},20000);
