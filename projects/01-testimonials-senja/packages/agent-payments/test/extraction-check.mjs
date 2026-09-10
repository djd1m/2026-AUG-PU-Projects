import { mkdirSync,readFileSync,writeFileSync,cpSync,rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('test/.extraction');mkdirSync(root,{recursive:true});
function run(command,args,cwd=process.cwd()) {
  const result=spawnSync(command,args,{cwd,encoding:'utf8'});
  if(result.status!==0)throw Error(`${command} failed: ${result.stderr}\n${result.stdout}`);return result.stdout;
}
try {
  const pack=JSON.parse(run('npm',['pack','--json','--workspaces=false','--pack-destination',root]));
  const consumer=resolve(root,'consumer');mkdirSync(consumer,{recursive:true});
  writeFileSync(resolve(consumer,'package.json'),JSON.stringify({name:'isolated-reference-consumer',private:true,type:'module'}));
  run('npm',['install','--ignore-scripts','--workspaces=false','--no-audit','--cache',process.env.AGENT_PAYMENTS_NPM_CACHE??resolve(root,'cache'),...(process.env.AGENT_PAYMENTS_NPM_CACHE?['--offline']:[]),resolve(root,pack[0].filename)],consumer);
  const fixture=readFileSync('test/reference-host.mjs','utf8').replace("'../dist/index.js'","'@course/agent-payments'");
  writeFileSync(resolve(consumer,'reference-host.mjs'),fixture);
  writeFileSync(resolve(consumer,'check.mjs'),`import assert from 'node:assert/strict';
import { fixture,pool,setup } from './reference-host.mjs';
try {await setup();for(const [amount,product] of [['777','isolated-book'],['4567','isolated-course']]) {
const f=await fixture({amount,product});const o=await f.order();const paid=await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});
assert.equal(paid.quote.amount.minor,amount);assert.equal(paid.quote.productId,product);assert.equal(paid.paymentStatus,'succeeded');
} console.log('PASS: packed isolated consumer, two different host products, no attribution');} finally {await pool.end();}`);
  console.log(run(process.execPath,['check.mjs'],consumer).trim());
} finally {rmSync(root,{recursive:true,force:true});}
