import type { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { migrationFiles } from './schema.js';
export async function migrate(pool:Pool, directory?:string):Promise<void> {
 const client=await pool.connect();
 try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(80913000)');
  await client.query('CREATE TABLE IF NOT EXISTS _schema_migration(name text PRIMARY KEY,sha text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const file of await migrationFiles(directory)) {
   const old=await client.query<{sha:string}>('SELECT sha FROM _schema_migration WHERE name=$1',[file.name]);
   if(old.rows[0]) { if(old.rows[0].sha!==file.sha) throw new Error(`Migration changed: ${file.name}`); continue; }
   await client.query(file.sql); await client.query('INSERT INTO _schema_migration(name,sha) VALUES($1,$2)',[file.name,file.sha]);
  }
  // A schema metadata write must remain operator-only in the deployed public schema.
  const role=await client.query("SELECT 1 FROM pg_roles WHERE rolname='n8_app'");
  if(role.rowCount) await client.query('REVOKE INSERT,UPDATE,DELETE ON _schema_migration FROM n8_app');
  await client.query('COMMIT');
 } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const {Pool}=await import('pg'); if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 try {await migrate(pool);process.stdout.write('Migrations applied\n');} finally{await pool.end();}
}
