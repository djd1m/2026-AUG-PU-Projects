import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
const destination=process.argv[2];
if(!destination?.startsWith('/tmp/'))throw new Error('Explicit private /tmp receipt directory required');
await mkdir(destination,{recursive:true,mode:0o700});
const selected=new Set(process.argv.slice(3));
const mutations=[
 ['test-isolation','packages/shared/src/support-config.ts',"env.NODE_ENV!=='test'||!isolated","env.NODE_ENV!=='test'",'tests/support-backend-environment.test.ts'],
 ['synthetic-capture','apps/web/src/server/support/mail.ts','!synthetic||!this.capture','!this.capture','tests/support-backend-boundary.test.ts'],
 ['runtime-env-wiring','scripts/check-env-wiring.mjs','aliases.add(parent.name.text);','void parent.name.text;','tests/support-backend-environment.test.ts'],
 ['storage-cap','packages/db/src/support-email.ts','>=10000','>=10001','tests/support-email.integration.test.ts'],
 ['bounded-pruning','packages/db/src/support-email.ts','LIMIT 100','LIMIT 101','tests/support-email.integration.test.ts'],
 ['erasure-proof','apps/web/src/server/erasure.ts','SET email_verified_at=NULL','SET email_verified_at=email_verified_at','tests/support-email.integration.test.ts'],
 ['origin','apps/web/src/server/support/boundary.ts',"request.headers.get('origin')!==new URL(deps.publicOrigin).origin","false",'tests/support-backend-boundary.test.ts'],
 ['body-limit','apps/web/src/server/support/boundary.ts','size>4096','size>8192','tests/support-backend-boundary.test.ts'],
 ['ip-quota','packages/db/src/support-email.ts','+counts.ip_count>=30','+counts.ip_count>=31','tests/support-email.integration.test.ts'],
 ['one-use','packages/db/src/support-email.ts',"AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id","AND account_id=$2 AND email=$3 AND expires_at>clock_timestamp() RETURNING id",'tests/support-email.integration.test.ts'],
 ['wall-clock','packages/db/src/support-email.ts',"AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id","AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>now() RETURNING id",'tests/support-email.integration.test.ts'],
 ['staff-revocation','packages/db/src/support-admin.ts',"AND o.revoked_at IS NULL`,[hash]","`,[hash]",'tests/support-email.integration.test.ts'],
 ['widget-identity','apps/web/src/server/support/widget.ts','external_user_id:account.id','user_id:account.id','tests/support-email.integration.test.ts'],
 ['smtp-cap','apps/web/src/server/support/mail.ts','this.budget.active>=4','this.budget.active>=5','tests/support-mail-tls.test.ts'],
 ['smtp-total-deadline','apps/web/src/server/support/mail.ts',"resolve('unknown');},8000)","resolve('unknown');},10000)",'tests/support-mail-tls.test.ts'],
 ['smtp-tls-verification','apps/web/src/server/support/mail.ts',"{...options,getSocket:","{...options,tls:{rejectUnauthorized:false},getSocket:",'tests/support-mail-tls.test.ts'],
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const run=async(label,file)=>{
 const log=path.join(destination,`${label}-${randomBytes(4).toString('hex')}.log`);
 const result=spawnSync(process.execPath,['scripts/test.mjs',file],{env:process.env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
 await writeFile(log,(result.stdout??'')+(result.stderr??''),{flag:'wx',mode:0o600});
 return {exit:result.status,signal:result.signal,log,sha256:sha(await readFile(log))};
};
const receipts=[];
for(const [name,file,before,after,test] of mutations) {
 if(selected.size&&!selected.has(name))continue;
 const source=await readFile(file,'utf8');
 if(!source.includes(before))throw new Error(`Mutation anchor missing: ${name}`);
 let red;
 try{await writeFile(file,source.replaceAll(before,after));red=await run(`${name}-red`,test);}
 finally{await writeFile(file,source);}
 if(red.exit===0||red.exit===null)throw new Error(`Mutation did not produce a test failure: ${name}`);
 const green=await run(`${name}-green`,test);
 const restored=sha(await readFile(file))===sha(source);
 const receipt={name,file,test,testSha256:sha(await readFile(test)),sourceSha256:sha(source),red,green,restored};receipts.push(receipt);
 console.log(JSON.stringify({name,red:red.exit,green:green.exit,restored}));
 if(green.exit!==0||!restored)throw new Error(`Restored source did not pass: ${name}`);
}
const output=path.join(destination,`mutations-${randomBytes(4).toString('hex')}.json`);
await writeFile(output,JSON.stringify({sourceRevision:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),receipts},null,2)+'\n',{flag:'wx',mode:0o600});
if(!(await stat(output)).isFile())throw new Error('Receipt is not regular');
console.log(JSON.stringify({receipt:output,sha256:sha(await readFile(output)),mutations:receipts.length}));
