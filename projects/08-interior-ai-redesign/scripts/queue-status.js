import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
const pool=createPool(readConfig().databaseUrl);
try {
  const budgets=await pool.query(`SELECT bucket,owner,day,count FROM attempt_budget
    WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date ORDER BY bucket,owner`);
  const jobs=await pool.query('SELECT status,count(*)::int AS count FROM job WHERE deleted_at IS NULL GROUP BY status ORDER BY status');
  console.log(JSON.stringify({budgets:budgets.rows,jobs:jobs.rows}));
} catch {console.error('queue_status_failed');process.exitCode=1;}
finally {await pool.end();}
