import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const mutations=[
 {name:'merchant-proof',file:'packages/domain/src/billing/index.ts',from:'payment.merchantId !== config.shopId || ',to:'',test:'tests/billing/repository.test.ts',title:'merchant/test/amount/currency/paid/status/metadata/bound-id negatives'},
 {name:'refund-account-hold',file:'packages/db/src/billing.ts',from:'UPDATE account SET billing_hold=true,paid_export=false WHERE id=$1',to:'UPDATE account SET billing_hold=false,paid_export=false WHERE id=$1',test:'tests/billing/refund.test.ts',title:'refund before actual PgJobs dispatch mark'}
];
mkdirSync('tests/billing/mutation-evidence',{recursive:true});const results=[];
for(const m of mutations){
 const original=readFileSync(m.file,'utf8');if(original.split(m.from).length!==2)throw Error('mutation anchor is not unique');const changed=original.replace(m.from,m.to);let red;
 try{writeFileSync(m.file,changed);red=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',m.test,'-t',m.title,'--reporter=verbose'],{encoding:'utf8',env:process.env});writeFileSync(`tests/billing/mutation-evidence/${m.name}-red.txt`,red.stdout+red.stderr);if(red.status!==1||!red.stdout.includes('1 failed'))throw Error(`mutation ${m.name} did not produce expected failing test`);}
 finally{writeFileSync(m.file,original);}
 const green=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',m.test,'-t',m.title,'--reporter=verbose'],{encoding:'utf8',env:process.env});writeFileSync(`tests/billing/mutation-evidence/${m.name}-restored.txt`,green.stdout+green.stderr);if(green.status!==0)throw Error(`restored ${m.name} failed`);
 results.push({name:m.name,file:m.file,test:m.test,title:m.title,originalSha256:hash(original),mutatedSha256:hash(changed),restoredSha256:hash(readFileSync(m.file)),redExit:red.status,restoredExit:green.status});
}
writeFileSync('tests/billing/mutation-evidence/results.json',JSON.stringify({observedAt:new Date().toISOString(),results},null,2)+'\n');console.log('Two production mutations failed targeted assertions and restored tests passed.');
