import { mkdtemp,cp,readFile,writeFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=resolve('.');
const cases=[
  {name:'external-order-metadata',file:'shared/payments/service.mjs',from:"assert(payment.orderId===input.orderId,'PAYMENT_BINDING_CONFLICT',409);",to:"assert(true,'PAYMENT_BINDING_CONFLICT',409);",test:'tests/external-payment.test.mjs',pattern:'wrong metadata'},
  {name:'external-paid-status',file:'shared/payments/service.mjs',from:"assert(payment.status==='succeeded' && payment.paid && payment.paidAt!==null,'PROVIDER_UNVERIFIED',409);",to:"assert(payment.status==='succeeded' && payment.paidAt!==null,'PROVIDER_UNVERIFIED',409);",test:'tests/external-payment.test.mjs',pattern:'wrong metadata'},
  {name:'external-order-source',file:'shared/payments/service.mjs',from:" AND external=true FOR UPDATE",to:" FOR UPDATE",test:'tests/external-payment.test.mjs',pattern:'rejects missing and native'},
  {name:'external-reauthorize',file:'shared/payments/service.mjs',from:'await transaction(pool,authorizedOrder);',to:'const stale=await transaction(pool,authorizedOrder);',test:'tests/external-payment.test.mjs',pattern:'authority is rechecked',secondFrom:'const {resolved,state,order}=await authorizedOrder(client);',secondTo:'const {resolved,state,order}=stale;'},
];
const results=[];await mkdir('.runtime',{recursive:true});
for(const mutation of cases) {
  const directory=await mkdtemp(join(tmpdir(),'n3-external-mutation-'));const started=performance.now();
  try {
    for(const name of ['apps','shared','tests'])await cp(join(root,name),join(directory,name),{recursive:true});
    await mkdir(join(directory,'node_modules'));
    const file=join(directory,mutation.file),source=await readFile(file,'utf8');
    if(source.split(mutation.from).length!==2)throw new Error(`Mutation site is ambiguous: ${mutation.name}`);
    let changed=source.replace(mutation.from,mutation.to);
    if(mutation.secondFrom){if(changed.split(mutation.secondFrom).length!==2)throw new Error('Ambiguous second mutation');changed=changed.replace(mutation.secondFrom,mutation.secondTo);}
    await writeFile(file,changed);
    const run=spawnSync('docker',['compose','-f',join(root,'docker-compose.test.yml'),'run','--rm','--no-deps',
      '-v',`${directory}:/app:ro`,'-v',`${root}/node_modules:/app/node_modules:ro`,'backend','node','--test',`--test-name-pattern=${mutation.pattern}`,mutation.test],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
    const output=(run.stdout ?? '')+(run.stderr ?? '');
    const detected=run.status===1 && /not ok /.test(output) && /# fail [1-9]/.test(output)
      && !/SyntaxError|ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/.test(output);
    const result={name:mutation.name,sourceSha256:createHash('sha256').update(source).digest('hex'),detected,exitCode:run.status,durationMs:Math.round(performance.now()-started)};
    results.push(result);console.log(JSON.stringify(result));
    await writeFile(`.runtime/external-mutation-${mutation.name}.tap`,output);
    if(!detected)throw new Error(`Mutation survived or test could not run: ${mutation.name}`);
  } finally {await rm(directory,{recursive:true,force:true});}
}
await writeFile('.runtime/external-mutations.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
