import { createPool } from './index.js';
import { setSupportOperator } from './support-admin.js';
export async function main(args:readonly string[],env:NodeJS.ProcessEnv) {
  if(args.length!==6||args[2]!=='--by'||args[4]!=='--reason'||!env.DATABASE_URL)return 2;
  const pool=createPool(env.DATABASE_URL);
  try{return await setSupportOperator(pool,{accountId:args[0]!,action:args[1]!,actor:args[3]!,reason:args[5]!})?0:1;}
  catch{console.error('Support membership command failed');return 2;}
  finally{await pool.end();}
}
if(require.main===module)main(process.argv.slice(2),process.env).then(code=>{process.exitCode=code;});
