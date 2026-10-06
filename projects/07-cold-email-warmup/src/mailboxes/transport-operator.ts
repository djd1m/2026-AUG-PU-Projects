import { readFile,stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { publishTransportGrant } from './transport-authority.js';
async function main(){const config=loadConfig(),pool=createPool(config.databaseUrl);try{
 if(!await ready(pool)||!process.env.OPERATOR_TOKEN_FILE)throw new Error();
 const token=(await readFile(process.env.OPERATOR_TOKEN_FILE,'utf8')).trim();
 const [action,tenant,mailbox,revision,file]=process.argv.slice(2);if(!tenant||!mailbox||!revision||!['publish','revoke'].includes(action??''))throw new Error();
 let grant:unknown=null;if(action==='publish'){if(!file||(await stat(file)).size>16384)throw new Error();try{grant=JSON.parse(await readFile(file,'utf8'));}catch{grant={invalid:true};}}
 const next=await publishTransportGrant(pool,config,token,tenant,mailbox,revision,grant);process.stdout.write(JSON.stringify({revision:next})+'\n');
 }catch{process.stderr.write('transport_operator_failed\n');process.exitCode=1;}finally{await pool.end();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
