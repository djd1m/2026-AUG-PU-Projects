import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPool } from '../web/db.js';
import { readConfig } from '../web/config.js';
import { createPartners } from '../web/partners.js';
export async function partnerCommand(service,args) {
  const [command,id,value]=args;
  if(command==='create'&&args.length===2)return service.create(id);
  if(command==='activate'&&args.length===3&&['true','false'].includes(value))return service.activate(id,value==='true');
  if(command==='aggregate'&&args.length===2)return service.aggregate(id);
  throw new Error('usage: partner.js create ACCOUNT_UUID | activate PARTNER_UUID true/false | aggregate PARTNER_UUID');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  let pool;
  try {pool=createPool(readConfig().databaseUrl);console.log(JSON.stringify(await partnerCommand(createPartners(pool),process.argv.slice(2))));}
  catch(e){console.error(e.status?`partner_error_${e.status}`:'partner_command_failed');process.exitCode=1;}
  finally{await pool?.end();}
}
