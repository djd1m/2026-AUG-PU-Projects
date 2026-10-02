import { readConfig } from './config.js';
import { createPool } from './db.js';
import { prepareStorage } from './media.js';
import { createApp } from './app.js';
let pool;
try {
  if (process.versions.node.split('.')[0] !== '22') throw new Error('Node22 required');
  const config = readConfig();
  pool = createPool(config.databaseUrl);
  const migration = await pool.query('SELECT version FROM schema_migration WHERE version=1');
  if (migration.rowCount !== 1) throw new Error('Migration required');
  await prepareStorage(config.storageDir);
  const server = createApp(pool,config);
  server.on('error', () => { console.error('server_failed'); process.exitCode=1; pool.end(); });
  server.listen(config.port,config.host,() => console.log('roomkind_ready'));
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,() => {
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1),10000).unref();
  });
} catch { console.error('startup_failed'); await pool?.end(); process.exitCode=1; }
