// из N5: projects/05-podcast-clips-opus/packages/db/src/index.ts (createPool) — имя приложения n6
import { Pool } from 'pg';

// Без connectionTimeoutMillis pg.Pool ждёт бесконечно: недоступность БД обязана быть отказом.
export function createPool(databaseUrl: string, schema?: string): Pool {
  if (schema !== undefined && !/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Непригодная схема БД');
  return new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000, statement_timeout: 5000, application_name: schema ?? 'n6-foundation',
    ...(schema === undefined ? {} : { options: `-c search_path=${schema},public` }) });
}
