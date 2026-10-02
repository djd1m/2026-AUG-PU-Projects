import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { PoolStore } from '../pool/store.js';
import { DispatchStore } from './store.js';
// Explicit bounded planning tick. No submission or adapter call is possible here.
const config=loadConfig();const pool=createPool(config.databaseUrl);
try {
 if(!await ready(pool)) throw new Error('database_not_ready');
 const scheduled=await new PoolStore(pool).tick();
 const reservation=await new DispatchStore(pool).claim();
 process.stdout.write(JSON.stringify({scheduled:scheduled.created,status:scheduled.status,reserved:reservation!==null})+'\n');
} catch {process.stderr.write('planning_tick_failed\n');process.exitCode=1;} finally {await pool.end();}
