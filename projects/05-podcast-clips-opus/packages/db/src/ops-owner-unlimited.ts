import { createPool } from './index.js';
import { setOwnerUnlimited, type OwnerUnlimitedInput } from './owner-entitlement.js';

export function parseOwnerUnlimitedArgs(args: readonly string[]): OwnerUnlimitedInput | null {
  if (args.length!==6 || !['on','off'].includes(args[1]!) || args[2]!=='--by' || args[4]!=='--reason') return null;
  return {accountId:args[0]!,enabled:args[1]==='on',operator:args[3]!,reason:args[5]!};
}
export async function main(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const input=parseOwnerUnlimitedArgs(args);
  if (!input || !env.DATABASE_URL?.trim()) {
    console.error('Usage: ops:owner-unlimited -- <account UUID> on|off --by <actor> --reason <reason>; DATABASE_URL required'); return 2;
  }
  const pool=createPool(env.DATABASE_URL);
  try {
    const result=await setOwnerUnlimited(pool,input);
    if(result.kind!=='updated') { console.error(`Owner entitlement unchanged: ${result.kind}`); return 1; }
    console.log(`Owner entitlement: ${result.before} -> ${result.after}; audit recorded`); return 0;
  } catch { console.error('Owner entitlement transaction failed'); return 2; }
  finally { await pool.end(); }
}
if(require.main===module) main(process.argv.slice(2),process.env).then(code=>{process.exitCode=code;});
