import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { PoolStore } from '../pool/store.js';
import { SubmissionStore } from './submission.js';
import { DispatchStore } from './store.js';
// Operator CLI only: bounded durable tick; local sink requires explicit process config.
const config=loadConfig();const pool=createPool(config.databaseUrl);
try {
 if(!await ready(pool)) throw new Error('database_not_ready');
 if(config.dispatchMode!=='local_test') throw new Error('dispatch_disabled');
 const submissions=new SubmissionStore(pool,config);await submissions.recoverAbandoned();
 const scheduled=await new PoolStore(pool).tick();
 const reservation=await new DispatchStore(pool).claim();
 const result=reservation?await submissions.submit(reservation.id,reservation.lease_owner):null;
 process.stdout.write(JSON.stringify({scheduled:scheduled.created,status:scheduled.status,reserved:reservation!==null,state:result?.state??null})+'\n');
} catch {process.stderr.write('planning_tick_failed\n');process.exitCode=1;} finally {await pool.end();}
