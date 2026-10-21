// Read-only source-branch probe; mocked transaction/ingestion, NOT a PostgreSQL test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const project=path.resolve(__dirname,'../../../..');
const source=fs.readFileSync(path.join(project,'src/replies/store.ts'),'utf8');
const marker=' async page(tenant:string,mailbox:string,input:PageInput) {';
assert.equal(source.split(marker).length,2);
const body=source.split(marker)[1].slice(0,source.split(marker)[1].lastIndexOf('\n }')).replace(/ as const/g,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const page=new AsyncFunction('tenant','mailbox','input','parsePage','eligibilityTransaction','stale','evidenceError',body);
(async()=>{
 const now=new Date('2026-10-02T12:00:00Z'),writes=[];
 const run={runId:'00000000-0000-0000-0000-000000000001',attempt:1,uidvalidity:'2',cursor:10,highWater:10,state:'scanning',pages:1,attemptStartedAt:now};
 const input={runId:run.runId,attempt:1,uidvalidity:'2',expectedCursor:10,coveredThrough:110,kind:'tail',startedAt:now,completedAt:now,headers:Array.from({length:100},(_,i)=>({uid:i+11,sender:'x@example.test',references:[],messageId:null}))};
 // These satisfy parsePage's range/count constraints; parsing itself is not exercised.
 assert.equal(input.headers.length,100);assert(input.headers.every(h=>h.uid>input.expectedCursor&&h.uid<=input.coveredThrough));
 const c={query:async(sql,args)=>{writes.push({sql,args});return {rows:[],rowCount:1};}};
 const receiver={pool:null,current:async()=>run,now:()=>now,ingest:async()=>0,hooks:{}};
 const result=await page.call(receiver,'tenant','mailbox',input,x=>x,async(_p,f)=>f(c),()=>Error('stale'),()=>Error('evidence'));
 assert.equal(result.state,'complete');const poll=writes.find(w=>w.sql.startsWith('UPDATE mailbox_poll'));assert.equal(poll.args[2],true);
 const output={kind:'read-only extracted production page branch with mocked dependencies',source_sha256:crypto.createHash('sha256').update(source).digest('hex'),hypothesis:'Tail snapshot UIDNEXT=112 has unread matching reply UID111; bounded prefix11..110 is fully covered.',tail_snapshot_uidnext:112,unread_reply_uid:111,accepted_page:{expectedCursor:10,coveredThrough:110,headerCount:100},result,poll_complete:poll.args[2],poll_completed_at:poll.args[3],limitation:'No DB, actual parsing, provider or dispatch executed. Source has no tail horizon/completeness input; this probe demonstrates the unconditional completion branch only.'};
 fs.writeFileSync(path.join(__dirname,'astra-a-tail-probe.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
