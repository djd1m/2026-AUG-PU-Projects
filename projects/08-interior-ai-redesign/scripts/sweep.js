import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
import { prepareStorage, sweepOrphans } from '../web/media.js';
let pool;
try {
  const config = readConfig(); pool = createPool(config.databaseUrl); await prepareStorage(config.storageDir);
  console.log('orphan_files_removed',await sweepOrphans(pool,config.storageDir));
} catch { console.error('sweep_failed'); process.exitCode=1; }
finally { await pool?.end(); }
