// Focused guards must fail when authority/commission ownership is deliberately broken.
import { readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const mutants=[
  {file:'src/lib/agent-payments/legacy.ts',from:'if (checkout)',to:'if (deleted.rowCount && checkout)',test:'tests/agent-payments-cancellation.test.ts'},
  {file:'src/lib/agent-payments/security.ts',from:"throw new AgentHostError('GATEWAY_UNAUTHORIZED', 401);",to:'return;',test:'tests/agent-payments-security.test.ts'},
  {file:'src/lib/agent-payments/host.ts',from:'if (!row.invoice_id)',to:'if (true)',test:'tests/agent-payments-host.test.ts'},
];
for(const mutant of mutants){
  const original=await readFile(mutant.file,'utf8');
  if(!original.includes(mutant.from))throw new Error(`Mutation target absent: ${mutant.file}`);
  try{
    await writeFile(mutant.file,original.replace(mutant.from,mutant.to));
    const result=spawnSync('../../node_modules/.bin/vitest',['run',mutant.test,'--maxWorkers=1','--minWorkers=1'],{encoding:'utf8'});
    if(result.error||result.status===null)throw new Error(`Runner failed for ${mutant.file}`);
    if(result.status===0)throw new Error(`SURVIVED: ${mutant.file}`);
    if(!(result.stdout+result.stderr).includes('AssertionError'))throw new Error(`Mutation failed without assertion: ${result.stdout}${result.stderr}`);
    console.log(`KILLED ${mutant.file}: ${mutant.from}`);
  }finally{await writeFile(mutant.file,original);}
}
