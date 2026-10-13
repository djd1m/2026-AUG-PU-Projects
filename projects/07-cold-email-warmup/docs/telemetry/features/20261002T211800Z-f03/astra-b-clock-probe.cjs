// Source-derived, in-memory clock/lock probe. No DB, network, secrets or product edits.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const submission = fs.readFileSync(path.join(root, 'src/dispatch/submission.ts'), 'utf8');
const transaction = fs.readFileSync(path.join(root, 'src/consent/transaction.ts'), 'utf8');
const eligibility = fs.readFileSync(path.join(root, 'src/dispatch/eligibility.ts'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
// Execute the exact transaction body and final-transition prefix, excluding rendering/outcomes.
const txBody = transaction.slice(transaction.indexOf('  const client='), transaction.lastIndexOf('}'));
const tx = new AsyncFunction('pool', 'operation', txBody);
const prefix = submission.slice(submission.indexOf('  await this.fixtures.beforeFinal'), submission.indexOf('   const sender='));
const finalPrefix = new AsyncFunction('id', 'owner', 'eligibilityTransaction', 'freshMailbox', 'poolEligible', prefix + '   return row;\n  });\n return prepared;');
const fresh = eligibility.match(/freshMailbox=`([\s\S]*?)`;/)[1];
const eligible = eligibility.match(/poolEligible=`([\s\S]*?)`;/)[1].replace('${freshMailbox}',fresh);
(async () => {
 const examples = [
  {name:'lease expiry while acquiring lock', before:'2026-10-02T12:00:44.999Z', after:'2026-10-02T12:00:45.000Z', boundary:'2026-10-02T12:00:45.000Z', kind:'deadline'},
  {name:'poll ages to exactly60s while acquiring lock', before:'2026-10-02T12:00:59.999Z', after:'2026-10-02T12:01:00.000Z', boundary:'2026-10-02T12:00:00.000Z', kind:'poll'},
  {name:'retry reaches120s while acquiring lock', before:'2026-10-02T12:01:59.999Z', after:'2026-10-02T12:02:00.000Z', boundary:'2026-10-02T12:02:00.000Z', kind:'deadline'},
  {name:'UTC midnight while acquiring lock', before:'2026-10-02T23:59:59.999Z', after:'2026-10-03T00:00:00.000Z', kind:'day'},
 ];
 const results=[];
 for(const example of examples) {
  let now=new Date(example.before), observed;
  const order=[];
  const client={async query(sql,params){
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){order.push(sql);return {rows:[]};}
   if(sql==='SELECT pg_advisory_xact_lock(7,1)'){order.push('LOCK acquired');now=new Date(example.after);return {rows:[]};}
   if(sql.startsWith('UPDATE send_job j SET state=\'submitting\'')) {
    observed={boundTime:params[0].toISOString(),boundDay:params[3],timeAfterLock:now.toISOString()};
    order.push('conditional UPDATE');
   }
   return {rows:[]}; // Deliberately do not simulate SQL acceptance or transport.
  },release(){order.push('release');}};
  const context={fixtures:{},config:{dispatchMode:'local_test'},pool:{async connect(){return client;}},now(){return now;}};
  await finalPrefix.call(context,'fixture-job','fixture-owner',tx,fresh,eligible);
  assert.equal(observed.boundTime,example.before);
  const actual=new Date(observed.timeAfterLock), bound=new Date(observed.boundTime), boundary=new Date(example.boundary);
  if(example.kind==='deadline') {observed.boundPredicate=bound<boundary;observed.currentPredicate=actual<boundary;}
  if(example.kind==='poll') {observed.boundPredicate=bound-boundary<60000;observed.currentPredicate=actual-boundary<60000;}
  if(example.kind==='day') {observed.currentDay=actual.toISOString().slice(0,10);assert.notEqual(observed.boundDay,observed.currentDay);}
  else {assert.equal(observed.boundPredicate,true);assert.equal(observed.currentPredicate,false);}
  results.push({name:example.name,...observed,queryOrder:order});
 }
 console.log(JSON.stringify({method:'Exact source transaction body/final SQL prefix; mocked client only demonstrates timestamp binding, not realPG execution or adapter calls',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
