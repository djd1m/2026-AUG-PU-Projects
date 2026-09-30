import { createHealthHandler } from '@/server/health';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createHealthHandler(async () => {
  const { pool } = getRuntime(); // ConfigError здесь → 503
  await pool.query('SELECT 1');
});
