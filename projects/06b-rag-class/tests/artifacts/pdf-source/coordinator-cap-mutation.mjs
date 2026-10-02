import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const file='packages/db/src/pdf-sources.ts';
const original=readFileSync(file);
const hash=b=>createHash('sha256').update(b).digest('hex');
const guard="if (Number(count.n) >= 3) return 'cap';";
if(original.toString().split(guard).length!==2) throw Error('Guard not unique');
const args=['run','--config','vitest.int.config.ts','apps/web/tests/int/pdf-sources.int.test.ts','-t','PDF-03 cap: 10 concurrent requests'];
const run=()=>spawnSync('./node_modules/.bin/vitest',args,{encoding:'utf8',timeout:120000});
const report={baseline_sha256:hash(original),started_at:new Date().toISOString()};
let red;
try {
 const mutant=original.toString().replace(guard,"if (Number(count.n) >= 4) return 'cap';");
 writeFileSync(file,mutant); report.mutant_sha256=hash(mutant);
 red=run(); console.log('MUTATION RED',red.status,red.stdout,red.stderr);
 report.red_exit=red.status;
} finally { writeFileSync(file,original); report.restored_sha256=hash(readFileSync(file)); }
const green=run(); console.log('RESTORED GREEN',green.status,green.stdout,green.stderr);
report.green_exit=green.status; report.finished_at=new Date().toISOString();
report.meaningful_red=red?.status===1 && /AssertionError/.test(red.stdout+red.stderr) && /PDF-03 cap/.test(red.stdout+red.stderr);
console.log('MUTATION_REPORT',JSON.stringify(report));
if(!report.meaningful_red||green.status!==0||report.restored_sha256!==report.baseline_sha256) process.exit(1);
