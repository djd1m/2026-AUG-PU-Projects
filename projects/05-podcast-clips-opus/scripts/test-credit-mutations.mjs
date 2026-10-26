import { mkdtempSync,cpSync,symlinkSync,readFileSync,writeFileSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const project=process.cwd(),directory=mkdtempSync(join(tmpdir(),'n5-credit-mutations-'));
const output=resolve(process.argv[2]??'tests/artifacts/credit-packages/mutations');mkdirSync(output,{recursive:true});
const results=[];
try {
  for(const name of ['apps','packages','tests','scripts'])cpSync(name,join(directory,name),{recursive:true,filter:p=>!/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(p)});
  for(const name of ['package.json','tsconfig.base.json','vitest.config.ts','docker-compose.yml'])cpSync(name,join(directory,name));
  symlinkSync(join(project,'node_modules'),join(directory,'node_modules'),'dir');
  const mutations=[
    ['whole-minute','packages/shared/src/tariff.ts','return Math.ceil(duration);','return Math.ceil(duration/60)*60;','closed exact catalog'],
    ['trial-size','packages/shared/src/tariff.ts','30 * CREDIT_SECOND_UNITS','31 * CREDIT_SECOND_UNITS','20 same-email'],
    ['trial-unique','packages/db/migrations/022_credit_packages.sql',"CREATE UNIQUE INDEX credit_trial_once ON credit_grant(account_id) WHERE source IN ('signup','migration_trial');",'-- trial unique disabled','lifetime trial constraint'],
    ['balance-predicate','packages/db/src/credits.ts','reduce((n,g)=>n+g.remaining_seconds,0)<seconds','reduce((n,g)=>n+g.remaining_seconds,0)<0','20 last-balance'],
    ['video-identity','packages/db/src/credits.ts',"if (charge && charge.state !== 'released') return 'reserved';","if (false) return 'reserved';",'20 last-balance'],
    ['recovery-window','packages/db/src/credits.ts',"interval '24 hours'","interval '30 days'",'expired release'],
    ['intent-once','packages/db/src/payments.ts','if (intent.fulfilled_at) {','if (false) {','exact SKU grants'],
    ['paid-addon-exhausted','packages/db/src/plan.ts',"cg.source='payment' AND cg.entitlement_start", "cg.source='payment' AND cg.remaining_seconds>0 AND cg.entitlement_start",'base renewals serialize'],
    ['protected-cohort','packages/db/src/credits.ts',"if (!owner || owner.plan !== 'free') return false;","if (!owner) return false;",'explicit opt-in protects'],
    ['partial-settle','packages/db/src/credits.ts',"if (!charge || (!video.done && video.status!=='failed')) return;","if (!charge || video.status!=='failed') return;",'first usable partial output'],
    ['immediate-upgrade','apps/web/src/server/billing-handler.ts',"return fail(422,'upgrade_unavailable'","return fail(200,'upgrade_unavailable'",'credit checkout rejects immediate'],
    ['checkout-date-disclosure','apps/web/src/app/upgrade/UpgradeScreen.tsx','p.purchaseWindows && <p data-state="prospective-period">','false && <p data-state="prospective-period">','multiple committed future base periods'],
    ['exclude-addon-scheduling','packages/db/src/credits.ts','AND base_sku IS NOT NULL','', 'multiple committed future base periods'],
    ['provider-payment-once','packages/db/src/payments.ts',"if (prior?.status === 'succeeded')","if (false)",'one verified provider payment'],
    ['provider-retry-customer','packages/db/src/transcription.ts',"if (previous > 0) {","if (previous > 0) { await tx.query('UPDATE credit_grant SET remaining_seconds=remaining_seconds-1 WHERE account_id=$1 AND remaining_seconds>0',[row.account_id]);",'trusted probe seconds'],
  ];
  for(const [id,file,before,after,title] of mutations){
    const p=join(directory,file),source=readFileSync(p,'utf8');
    if(!source.includes(before))throw new Error(`Missing mutation anchor ${id}`);
    const run=phase=>{
      const child=spawnSync(process.execPath,[join(project,'node_modules/vitest/vitest.mjs'),'run','tests/credit-packages.integration.test.ts','-t',title],{cwd:directory,encoding:'utf8',timeout:60000,env:{...process.env,N5_ACCEPTANCE:'0'}});
      writeFileSync(join(output,`${id}-${phase}.log`),`${child.stdout??''}${child.stderr??''}`);return child.status;
    };
    writeFileSync(p,source.replace(before,after));const red=run('red');writeFileSync(p,source);const green=run('green');
    results.push({id,red,green,passed:red===1&&green===0});console.log(`${id}: red=${red}, green=${green}`);
  }
  writeFileSync(join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  if(results.some(r=>!r.passed))process.exitCode=1;
} finally {rmSync(directory,{recursive:true,force:true});}
