import pg from 'pg';
import { migrate } from '@course/agent-payments';

// Explicit optional migration; existing db:migrate remains usable independently.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(pool);
  process.stdout.write('Agent payments schema migrated\n');
} finally {
  await pool.end();
}
