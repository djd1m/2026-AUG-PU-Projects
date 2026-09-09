import { mkdtemp, cp, readFile, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const mutations=[{
 name:'HTTP origin denial',file:'apps/api/http.mjs',from:'if (origin && !origins.has(origin))',to:'if (false)',
 tests:['tests/http-boundary.test.mjs'],
},{
 name:'HTTP API malformed URL guard',file:'apps/api/http.mjs',
 from:"try { path = new URL(req.url, 'http://n3.local').pathname; }\n    catch { return json(res, 400, { error: { code: 'INVALID_URL', message: 'Некорректный адрес запроса.' } }); }",
 to:"path = new URL(req.url, 'http://n3.local').pathname;",tests:['tests/http-request-target.test.mjs'],
},{
 name:'HTTP frontend malformed URL guard',file:'apps/frontend/server.mjs',
 from:"try { url = new URL(req.url, 'http://local'); }\n  catch { res.writeHead(400, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Некорректный адрес запроса'); return; }",
 to:"url = new URL(req.url, 'http://local');",tests:['tests/http-request-target.test.mjs'],
}];
const selected=process.argv.includes('--all')?mutations:mutations.filter(x=>x.name.startsWith('HTTP'));
const results=[];
for(const mutation of selected){
 const scratch=await mkdtemp(join(tmpdir(),'n3-mutation-'));
 try{
  for(const folder of ['apps','shared','tests'])await cp(join(root,folder),join(scratch,folder),{recursive:true});
  await symlink(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
  const run=()=>spawnSync(process.execPath,['--test',...mutation.tests],{cwd:scratch,encoding:'utf8',timeout:120000,maxBuffer:2e6});
  const baseline=run();
  if(baseline.status!==0)throw new Error(`Baseline failed for ${mutation.name}: ${baseline.stdout}\n${baseline.stderr}`);
  const file=join(scratch,mutation.file),source=await readFile(file,'utf8');
  if(source.split(mutation.from).length!==2)throw new Error(`Mutation must match exactly once: ${mutation.name}`);
  await writeFile(file,source.replace(mutation.from,mutation.to));
  const mutant=run();
  if(mutant.status!==1 || !/not ok/.test(mutant.stdout))throw new Error(`Mutation was not killed by an assertion: ${mutation.name}\n${mutant.stdout}\n${mutant.stderr}`);
  results.push({name:mutation.name,baselineExit:baseline.status,mutantExit:mutant.status,killed:true});
 }finally{await rm(scratch,{recursive:true,force:true});}
}
const output={at:new Date().toISOString(),results,scope:'Only listed mutations were executed; no mutation of live source or live database.'};
if(process.env.N3_EVIDENCE_DIR){await mkdir(process.env.N3_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.N3_EVIDENCE_DIR,'mutations.json'),JSON.stringify(output,null,2)+'\n');}
console.log(JSON.stringify(output,null,2));
