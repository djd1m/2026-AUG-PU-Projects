import { mkdtemp,cp,readFile,writeFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=resolve('.');
const cases=[
  {name:'credential-account-version',file:'shared/referrals/service.mjs',from:'key.version === account.version',to:'true',test:'tests/referral-service.test.mjs',pattern:'credential invalidation'},
  {name:'explicit-promo-precedence',file:'shared/referrals/service.mjs',from:"if (Object.hasOwn(input, 'promoCode')) {",to:'if (false) {',test:'tests/referral-service.test.mjs',pattern:'promo'},
  {name:'server-visit-expiry',file:'shared/referrals/service.mjs',from:'new Date(visit.expires_at).getTime() <= now()',to:'false',test:'tests/referral-service.test.mjs',pattern:'30 and published 60/90'},
  {name:'durable-binding-not-cookie-renewal',file:'shared/domain/referral-attribution.mjs',from:'const attributedAt = iso(binding.attributedAt);',to:"const attributedAt = iso(binding.attributedAt); assert(Date.parse(event.paidAt)-Date.parse(attributedAt)<=policy.windowDays*86400000,'WRONG_RENEWAL_WINDOW',409);",test:'tests/referral-payment.test.mjs',pattern:'late renewal'},
  {name:'verified-provider-claim',file:'shared/payments/yookassa.mjs',from:"verification(samePaymentClaim(claimed, payment), 'notification payment does not match provider');",to:"verification(true, 'notification payment does not match provider');",test:'tests/referral-payment.test.mjs',pattern:'forged provider claim'},
  {name:'test-money-payout-exclusion',file:'shared/domain/registry.mjs',from:"payment.source === 'connector' && payment.testMode === true",to:'false',test:'tests/referral-payment.test.mjs',pattern:'test commission does not consume'},
];
const results=[];await mkdir('.runtime',{recursive:true});
for(const mutation of cases) {
  const directory=await mkdtemp(join(tmpdir(),'n3-referral-mutation-'));const started=performance.now();
  try {
    for(const name of ['apps','shared','tests'])await cp(join(root,name),join(directory,name),{recursive:true});
    await mkdir(join(directory,'node_modules'));
    const file=join(directory,mutation.file),source=await readFile(file,'utf8');
    if(source.split(mutation.from).length!==2)throw new Error(`Mutation site is ambiguous: ${mutation.name}`);
    await writeFile(file,source.replace(mutation.from,mutation.to));
    const run=spawnSync('docker',['compose','-f',join(root,'docker-compose.test.yml'),'run','--rm','--no-deps',
      '-v',`${directory}:/app:ro`,'-v',`${root}/node_modules:/app/node_modules:ro`,'backend','node','--test',`--test-name-pattern=${mutation.pattern}`,mutation.test],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
    const output=(run.stdout ?? '')+(run.stderr ?? '');
    const detected=run.status===1 && /not ok /.test(output) && /# fail [1-9]/.test(output)
      && !/SyntaxError|ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/.test(output);
    const result={name:mutation.name,sourceSha256:createHash('sha256').update(source).digest('hex'),detected,exitCode:run.status,durationMs:Math.round(performance.now()-started)};
    results.push(result);console.log(JSON.stringify(result));
    await writeFile(`.runtime/referral-mutation-${mutation.name}.tap`,output);
    if(!detected)throw new Error(`Mutation survived or test could not run: ${mutation.name}`);
  } finally {await rm(directory,{recursive:true,force:true});}
}
await writeFile('.runtime/referral-mutations.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
