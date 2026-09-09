import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { originsFor } from '../shared/contracts/deployment.mjs';

const env={...process.env};
for(const variant of ['A','B','C','D'])env[`N3_${variant}_URL`]=originsFor(variant)[2];
const files=['a-merchant','b-customer','c-partner','d-agent'].map(v=>`tests/e2e/${v}.mjs`);
const child=spawn(process.execPath,['--test','--test-concurrency=1',...files],{env});
let output='';child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});
child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('close',async code=>{
  await mkdir('.runtime',{recursive:true});await writeFile('.runtime/public-e2e.tap',output);
  process.exitCode=code ?? 1;
});
