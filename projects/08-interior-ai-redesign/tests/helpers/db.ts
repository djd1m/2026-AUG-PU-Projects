import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../../packages/db/src/migrate.js';
export async function freshDb():Promise<{pool:Pool;close:()=>Promise<void>}> {
 const connectionString=process.env.TEST_DATABASE_URL;
 if(!connectionString) throw new Error('TEST_DATABASE_URL required: PostgreSQL tests cannot be skipped');
 const schema=`n8_test_${randomBytes(12).toString('hex')}`;
 const admin=new Pool({connectionString,max:2});
 await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString,max:12,options:`-c search_path=${schema}`});
 try {await migrate(pool);} catch(error){await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();throw error;}
 let closed=false;
 return {pool,close:async()=>{if(closed)return;closed=true;await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}};
}
