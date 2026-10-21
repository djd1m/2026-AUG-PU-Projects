import {Pool} from 'pg';
import {PgJobs} from '@n8/db/design';
import {runOneJob} from '../../apps/worker/src/jobs.ts';
import {live,clock} from './fixtures.ts';
if(process.env.NODE_ENV!=='test'||!/^n8_test_[a-f0-9]{24}$/.test(process.env.N8_TEST_SCHEMA??''))throw Error('Test-only isolated schema required');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${process.env.N8_TEST_SCHEMA}`}),jobs=new PgJobs(pool,{aiMode:'live',aiLive:live},clock(process.env.N8_TEST_NOW));let calls=0;
try{if(process.env.N8_TEST_PHASE==='dispatch'){await runOneJob({jobs,workerId:'actual-crash-fixture',provider:{verifyBudget:async()=>{},complete:async()=>{calls++;process.send({phase:'dispatched',calls});setInterval(()=>{},1000);return new Promise(()=>{});}}});}else{const swept=await jobs.sweep();const claimed=await runOneJob({jobs,workerId:'actual-restart-fixture',provider:{verifyBudget:async()=>{},complete:async()=>{calls++;throw Error('Unexpected redispatch');}}});const state=await jobs.get(process.env.N8_TEST_ACTOR,process.env.N8_TEST_JOB);process.send({phase:'restarted',swept,claimed,calls,state});}}finally{await pool.end();}
