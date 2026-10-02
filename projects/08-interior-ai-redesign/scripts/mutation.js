import { openSync, closeSync, readFileSync } from 'node:fs';
import { mkdtemp, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const kind=process.argv[2] ?? 'origin';
if (!['origin','owner'].includes(kind)) throw new Error('Unknown mutation');
const dir=await mkdtemp(join(tmpdir(),'n8-f01-mutation-'));
try {
  for (const path of ['web','db','scripts','tests','package.json','package-lock.json']) await cp(path,join(dir,path),{recursive:true});
  if (kind==='owner') await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
  const file=join(dir,kind==='origin'?'web/boundaries.js':'web/media.js');
  let source=await readFile(file,'utf8');
  if(kind==='origin') source=source.replace("if (req.headers.origin !== origin)","if (false)");
  else source=source.replaceAll('AND account_id=$2','AND $2::uuid IS NOT NULL');
  await writeFile(file,source);
  const log=join(dir,'mutation.log'); const fd=openSync(log,'w');
  let result;
  try { result=spawnSync(process.execPath,[kind==='origin'?'tests/boundaries.test.js':'tests/integration.test.js'],{cwd:dir,stdio:['ignore',fd,fd],timeout:120000,env:process.env}); } finally { closeSync(fd); }
  const output=readFileSync(log,'utf8');
  const expected=kind==='origin'?'Missing expected exception':'404';
  if(result.status===0 || !output.includes(expected)) { console.error('mutation_inconclusive',result.status,result.error?.code); process.exitCode=1; }
  else console.log(`mutation_${kind}_detected: test exit ${result.status}`);
} finally { await rm(dir,{recursive:true,force:true}); }
