import { createHealthHandler } from '@/server/health';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createHealthHandler(async () => {
  const { tenantPool, servicePool } = getRuntime(); // ConfigError здесь → 503
  await Promise.all([tenantPool.query('SELECT 1'), servicePool.query('SELECT 1')]); // обе роли входа живы
});
