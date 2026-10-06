import { open } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { parseGrant,publishAuthority,type DiagnosticGrant } from './diagnostic-authority.js';
// Privileged local process/file authority. External use needs separate owner authorization.
const config=loadConfig(),pool=createPool(config.databaseUrl);
try{
 if(!await ready(pool))throw new Error();const [action,expected,file]=process.argv.slice(2);if(!expected||!['publish','revoke'].includes(action??''))throw new Error();
 let grant:DiagnosticGrant|null=null;let invalid=false;
 if(action==='publish'){
  try{if(!file)throw new Error();const handle=await open(file,'r');try{const buffer=Buffer.alloc(16385);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>16384)throw new Error();grant=parseGrant(JSON.parse(buffer.subarray(0,bytesRead).toString('utf8')));if(new Date(grant.expiresAt)<=new Date())throw new Error();}finally{await handle.close();}}catch{grant=null;invalid=true;}
 }
 const revision=await publishAuthority(pool,expected,grant);process.stdout.write('authority_committed_revision='+revision+'\n');
 if(invalid){process.stderr.write('invalid_input_authority_revoked\n');process.exitCode=1;}
}catch{process.stderr.write('authority_action_failed\n');process.exitCode=1;}finally{await pool.end();}
