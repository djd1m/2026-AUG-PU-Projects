import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const output=new URL('./mutation-evidence/',import.meta.url);await mkdir(output,{recursive:true});
const envFile=process.env.N8_TEST_ENV_FILE??'/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/test.env';
const mutations=[
 {name:'watermark',path:'packages/domain/src/sharing/index.ts',from:'return paidExport!==true||billingHold!==false;',to:'return false;',test:'tests/sharing/http.test.ts',pattern:'actual export strips EXIF'},
 {name:'rights',path:'packages/domain/src/sharing/index.ts',from:'rightsConfirmed:z.literal(true)',to:'rightsConfirmed:z.boolean()',test:'tests/sharing/repository.test.ts',pattern:'server watermark/provenance and ownership'},
 {name:'privacy',path:'apps/web/src/server/sharing.ts',from:'<p>${escape(view.caption)}</p>',to:'<p>${escape(view.caption)} ${(await repository.resolve(token)).asset.project_id}</p>',test:'tests/sharing/http.test.ts',pattern:'public HTML exposes only selected caption'}
];
const results=[];
for(const item of mutations){const original=await readFile(item.path,'utf8');if(!original.includes(item.from))throw Error('Mutation target missing: '+item.name);const hash=createHash('sha256').update(original).digest('hex');try{await writeFile(item.path,original.replace(item.from,item.to));const start=Date.now();const result=spawnSync(process.execPath,['--env-file='+envFile,'node_modules/vitest/vitest.mjs','run',item.test,'-t',item.pattern],{encoding:'utf8',timeout:60000});const log=result.stdout+'\n'+result.stderr;await writeFile(new URL(item.name+'-red.txt',output),log);const testFailed=/Tests[^\n]*\d+ failed/.test(log.replace(/\x1b\[[0-9;]*m/g,''));results.push({name:item.name,sourceSha256:hash,exitCode:result.status,failedAssertion:result.status!==0&&testFailed,elapsedMs:Date.now()-start});if(!testFailed||result.status===0)throw Error('Mutation did not produce failing tests: '+item.name);}finally{await writeFile(item.path,original);}}
await writeFile(new URL('results.json',output),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
