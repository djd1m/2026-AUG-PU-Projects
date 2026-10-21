// Source-derived route probe, no server/socket/database and no product changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
const source=fs.readFileSync(path.join(root,'src/server.ts'),'utf8');
const start=source.indexOf("        if(path==='/api/dispatch/messages'");
const end=source.indexOf("        if(path==='/api/pool'",start);
assert.ok(start>=0 && end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('path','req','res','identity','submissions','json','UUID','HttpError','config',source.slice(start,end).replaceAll('jobMatch[1]!', 'jobMatch[1]'));
(async()=>{
 const results=[];
 for(const endpoint of ['/api/dispatch/messages','/api/dispatch/jobs/11111111-1111-1111-1111-111111111111']) {
  let reads=0;
  const result=await route(endpoint,{method:'GET'},{},{tenant_id:'own-fixture'},
   {messages:async()=>{reads++;return [];},inspect:async()=>{reads++;return {state:'queued'};}},
   (_res,status,body)=>({status,body}),/^[0-9a-f-]{36}$/i,Error,{dispatchMode:'disabled'});
  assert.equal(result.status,200);assert.equal(reads,1);
  results.push({endpoint,dispatchMode:'disabled',status:result.status,readCalls:reads});
 }
 console.log(JSON.stringify({method:'Exact route block with authenticated identity and stub readers; no HTTP/DB execution. Full handler has authentication but no dispatchMode gate.',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
