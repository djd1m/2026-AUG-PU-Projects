import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { application } from './server.js';
try {
  const config = loadConfig(); const pool = createPool(config.databaseUrl);
  pool.on('error', () => console.error('database_unavailable'));
  await migrate(pool); const {server} = await application(config, pool);
  server.listen(config.port, '0.0.0.0', () => console.log('n7_web_ready'));
  const stop = () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} catch { console.error('n7_startup_failed'); process.exit(1); }
