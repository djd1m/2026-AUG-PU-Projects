import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
const pool = createPool(loadConfig().databaseUrl);
try { await migrate(pool); console.log('migration_ready'); } catch { console.error('migration_failed'); process.exitCode = 1; } finally { await pool.end(); }
