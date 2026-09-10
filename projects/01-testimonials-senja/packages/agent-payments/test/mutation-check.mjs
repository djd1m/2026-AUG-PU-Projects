import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(!process.env.AGENT_PAYMENTS_TEST_DATABASE_URL&&!process.env.TEST_DATABASE_URL)throw Error('Real PostgreSQL URL required; mutation gate cannot skip');
const mutations=[
  {name:'shared-budget-admission',file:'dist/budget.js',from:"requireValue(BigInt(spent.rows[0].minor) + BigInt(quote.amount.minor) <=\n            BigInt(budget.rows[0].limit_minor), 'budget_exceeded');",to:"requireValue(true, 'budget_exceeded');",test:'manual spending reduces agent budget'},
  {name:'provider-merchant-binding',file:'dist/settlement.js',from:'result.accountId === ctx.options.provider.accountId',to:'true',test:'forged provider merchant account'},
  {name:'settlement-deduplication',file:'dist/settlement.js',from:"if (order.paymentStatus === 'succeeded')\n            return ctx.view(order);",to:"if (false)\n            return ctx.view(order);",test:'same order concurrent execution and repeated settlement'},
];
for(const m of mutations) {
  const original=readFileSync(m.file,'utf8');if(!original.includes(m.from))throw Error(`Mutation anchor missing: ${m.name}`);
  try {
    writeFileSync(m.file,original.replace(m.from,m.to));
    const result=spawnSync(process.execPath,['--test',`--test-name-pattern=${m.test}`,'test/postgres.test.mjs'],{encoding:'utf8'});
    if(result.status===0||!result.stdout.includes('not ok')||!result.stdout.includes('AssertionError'))throw Error(`Mutation not killed by assertion: ${m.name}\n${result.stdout}\n${result.stderr}`);
    console.log(`KILLED ${m.name}: target test assertions failed as required`);
  } finally {writeFileSync(m.file,original);}
}
