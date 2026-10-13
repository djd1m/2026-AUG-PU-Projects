// Synthetic integration helper: each invocation uses the real isolated PG schema.
import { createPool } from '../web/db.js';
import { sweepOrphans } from '../web/media.js';
if (process.env.N8_TEST_DB_OWNERSHIP !== 'n8-f01' || !process.env.TEST_DATABASE_URL) {
  throw new Error('Dedicated F01 PostgreSQL ownership required');
}
const databaseUrl=new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]','db'].includes(databaseUrl.hostname)) {
  throw new Error('Only dedicated local/internal test DB allowed');
}
const pool=createPool(databaseUrl.href);
let queries=0;
const originalQuery=pool.query.bind(pool);
pool.query=(...args)=>{queries++; return originalQuery(...args);};
try {
  const removed=await sweepOrphans(pool,process.argv[2],Date.now(),{scanLimit:2,deleteLimit:1});
  console.log(JSON.stringify({removed,queries}));
} finally { await pool.end(); }
