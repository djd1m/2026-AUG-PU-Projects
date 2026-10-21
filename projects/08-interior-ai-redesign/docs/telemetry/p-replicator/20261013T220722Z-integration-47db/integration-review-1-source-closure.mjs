import {freshDb} from '../../../../tests/helpers/db.ts';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const evidence='docs/telemetry/p-replicator/20261013T220722Z-integration-47db/';
const db=await freshDb();
try {
 const files=['apps/worker/src/index.ts','apps/worker/src/jobs.ts','apps/worker/src/watchdog.ts','apps/worker/src/runtime.ts','apps/web/src/server/config.ts','apps/web/src/server/health.ts'];
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(f,'utf8')])));
 const schema=(await db.pool.query('SHOW search_path')).rows[0].search_path;
 const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
 const input=`
import {mkdtemp,mkdir,chmod,readFile,rm,writeFile,symlink} from 'node:fs/promises';
import {dirname} from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import {setTimeout as delay} from 'node:timers/promises';
const dir=await mkdtemp('/tmp/n8-source-closure-'),source=dir+'/source',asset=dir+'/assets',heartbeat=dir+'/worker-heartbeat.json';
const sources=${JSON.stringify(sources)};let child,exit;let output='';
try {
 await mkdir(source);await symlink('/app/node_modules',source+'/node_modules');await writeFile(source+'/package.json','{"type":"module"}');
 for(const [file,code] of Object.entries(sources)){await mkdir(dirname(source+'/'+file),{recursive:true});await writeFile(source+'/'+file,code);}
 await mkdir(asset,{mode:0o500});
 const start=()=>{child=spawn(process.execPath,['--import','tsx',source+'/apps/worker/src/index.ts'],{cwd:'/app',env:{PATH:process.env.PATH,NODE_ENV:'production',DATABASE_URL:${JSON.stringify(url.toString())},N8_PUBLIC_ORIGIN:'http://127.0.0.1:3088',N8_SESSION_SECRET:'s'.repeat(32),N8_ASSET_DIR:asset,N8_AI_MODE:'manual',N8_PAYMENTS_MODE:'off'},stdio:['ignore','pipe','pipe']});exit=once(child,'exit');child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);};
 const read=async()=>{try{return JSON.parse(await readFile(heartbeat,'utf8'));}catch{return null;}};
 const waitState=async(state)=>{const end=Date.now()+13000;while(Date.now()<end){const h=await read();if(h?.state===state)return h;await delay(100);}throw Error('EXPECTED_'+state);};
 start();await exit;const boot={exitCode:child.exitCode,heartbeat:await read(),output};
 await chmod(asset,0o700);start();const initial=await waitState('ready');await chmod(asset,0o500);const failed=await waitState('failed');await delay(1300);const sticky=await read();await chmod(asset,0o700);const recovered=await waitState('ready');child.kill('SIGTERM');await exit;
 const result={boot,initial,failed,sticky,recovered,signalExitCode:child.exitCode,heartbeatAfterStop:await read(),output,passed:boot.exitCode===1&&boot.heartbeat===null&&sticky?.state==='failed'&&child.exitCode===0&&await read()===null};console.log(JSON.stringify(result));
}finally{child?.kill('SIGTERM');await chmod(asset,0o700).catch(()=>{});await rm(dir,{recursive:true,force:true});}
`;
 const result=spawnSync('docker',['exec','-i','--user','node','n8-interior-local-worker-1','node','--import','tsx','--input-type=module'],{input,encoding:'utf8',timeout:35000});
 const receipt={time:new Date().toISOString(),scope:'Copied current six source modules under temporary directory, runtime dependencies from image3; original services unchanged; fresh test schema; manual/off',sourceSha256:Object.fromEntries(Object.entries(sources).map(([f,c])=>[f,createHash('sha256').update(c).digest('hex')])),status:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.code??null,liveCalls:0};
 await writeFile(evidence+'integration-review-1-storage-closure.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
 if(result.status!==0||!JSON.parse(result.stdout).passed)process.exitCode=1;
}finally{await db.close();}
