// Adapted N6 bounded pool; no shared pg type-parser mutation.
import { Pool } from 'pg';
export { Pool } from 'pg';
export function createPool(databaseUrl: string, schema?: string): Pool {
  if (schema !== undefined && !/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('INVALID_DB_SCHEMA');
  return new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000, statement_timeout: 5000, application_name: 'n8',
    ...(schema === undefined ? {} : { options: `-c search_path=${schema},public` }) });
}
