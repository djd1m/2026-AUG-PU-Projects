import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {writeFile,readFile,rm,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {certificate,fixture,MIME} from './fixture.mjs';
import {classify} from './smtp.mjs';
const evidence=process.env.N7_EVIDENCE;
const records=[];
async function operation(protocol,scenario,options={},module){
 const credentials=await certificate();const certificateSha256=createHash('sha256').update(credentials.cert).digest('hex');if(evidence)await writeFile(join(evidence,'public-ca-'+records.length+'.pem'),credentials.cert);const publicDir=await mkdtemp('/tmp/n7-author-i1-public-');const caPath=join(publicDir,'ca.pem');await writeFile(caPath,credentials.cert);
 const peer=await fixture(protocol,scenario,credentials);let child;const started=Date.now();let message=null,exit=null,close=null,killed=false;
 try{
  child=fork(module||new URL('./'+protocol+'.mjs',import.meta.url),[],{execPath:process.execPath,stdio:['ignore','pipe','pipe','ipc'],env:{N7_CHILD:protocol,N7_OPTIONS:JSON.stringify({port:peer.port,caPath,...options})}});
  // Keep library diagnostics out of evidence; only bounded numeric/class outcomes are recorded.
  child.stdout.resume();child.stderr.resume();child.on('message',m=>{message=m;});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{exit={code,signal};resolve();}));
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>{close={code,signal};resolve();}));
  const watchdog=setTimeout(()=>{killed=true;child.kill('SIGKILL');},7000);
  await exited;await closed;clearTimeout(watchdog);
  const joins=await peer.close();const record={protocol,scenario,mutation:Boolean(module),certificateSha256,options,elapsed:Date.now()-started,pid:child.pid,exit,close,killed,result:message?.result||null,memory:message?.baseline?{baseline:message.baseline,peak:message.peak,rssDelta:message.peak.rss-message.baseline.rss}:null,peer:{...peer.state,body:undefined},mimeMatches:peer.state.body===MIME.toString(),joins};records.push(record);
  assert.equal(killed,false,'native child deadline');assert.equal(exit.code,0,'native child exit');assert.deepEqual(exit,close);assert.equal(peer.state.accepted,peer.state.closed,'raw peer joins');assert.deepEqual(joins,{sockets:0,timers:0,listening:false});return record;
 }finally{await peer.close();await credentials.cleanup();await rm(publicDir,{recursive:true,force:true});}
}
test('ImapFlow read-only UID bounded partial and hostile limits',async()=>{
 const normal=await operation('imap','normal');assert.equal(normal.result.status,'complete');assert.deepEqual(normal.result.messages,[{uid:3,bytes:5}]);assert.equal(normal.result.horizon,9);assert(normal.peer.commands.includes('EXAMINE'));assert(!normal.peer.commands.includes('SELECT'));assert(normal.peer.commands.some(c=>c.includes('UID FETCH 1:9')&&c.includes('BODY.PEEK[1]<0.32768>')));
 for(const scenario of ['out-of-range','duplicate','no-tag','oversized-metadata','unsupported-mime'])assert.equal((await operation('imap',scenario)).result.status,'rejected');
 assert.equal((await operation('imap','changed-uid')).result.status,'reset');
 for(const scenario of ['advertised','ignore-partial']){const r=await operation('imap',scenario);assert.equal(r.result.status,'rejected');assert.match(r.result.code,/Literal|LITERAL|Response|RESPONSE/i);assert(r.elapsed<2500);assert(r.memory.rssDelta<=33554432);assert(r.peer.sentBytes<1048576);assert(r.peer.literalAdvertised>=8388608);}
 for(const scenario of ['stall-literal','trickle-literal']){const stall=await operation('imap',scenario,{deadline:400});assert.equal(stall.result.status,'rejected');assert(stall.elapsed<2500);}
});
test('aggregate receive compatibility counterexample remains explicit',async()=>{
 const r=await operation('imap','aggregate-receive');assert.equal(r.result.status,'complete');assert(r.result.received>1048576,'negative witness must actually cross normative total cap');assert(r.peer.sentBytes>1048576);
});
test('verified numeric IP and hostname gates',async()=>{
 for(const protocol of ['imap','smtp'])for(const options of [{hostname:'mismatch.invalid'},{untrusted:true}]){const r=await operation(protocol,'normal',options);assert.notEqual(r.result.status,'accepted');assert.notEqual(r.result.status,'complete');assert.equal(r.peer.auth,0);assert.equal(r.peer.bytes,0);}
});
test('SMTP public connection acceptance, exact MIME, refusals and uncertainty',async()=>{
 const upgraded=await operation('smtp','starttls-normal',{starttls:true});assert.equal(upgraded.result.status,'accepted');assert.equal(upgraded.mimeMatches,true);assert(upgraded.peer.commands.indexOf('STARTTLS')<upgraded.peer.commands.indexOf('AUTH'));
 const normal=await operation('smtp','normal');assert.equal(normal.result.status,'accepted');assert.equal(normal.mimeMatches,true);assert.equal(normal.peer.auth,1);assert.equal(normal.peer.plaintextAuth,0);assert.equal(normal.peer.recipients,1);assert.equal(normal.peer.accepted,1);assert.equal(normal.peer.terminator,true);assert.deepEqual(normal.peer.sni,['fixture.invalid']);
 for(const scenario of ['data-450','data-550']){const r=await operation('smtp',scenario);assert.equal(r.result.status,'rejected');assert.equal(r.peer.bytes,0);}
 for(const scenario of ['drop-pre','drop-body','drop-final','malformed-final','stall-final']){const r=await operation('smtp',scenario,{deadline:400});assert.equal(r.result.status,scenario==='drop-pre'?'not_accepted':'unknown_delivery');assert.equal(r.peer.accepted,1);if(scenario==='drop-pre'){assert.equal(r.peer.bytes,0);assert.equal(r.result.bodyStarted,false);}else assert.equal(r.result.bodyStarted,true);}
 for(const scenario of ['final-450','final-550'])assert.equal((await operation('smtp',scenario)).result.status,'rejected');
});
test('stalled greeting/auth deadlines close exact children',async()=>{
 for(const protocol of ['imap','smtp'])for(const scenario of ['stall-connect','stall-auth']){const r=await operation(protocol,scenario,{deadline:400});assert.notEqual(r.result.status,'complete');assert.notEqual(r.result.status,'accepted');assert(r.elapsed<2500);}
});
test('additional handshake, STARTTLS-negative and body/final abort witnesses',async()=>{
 for(const protocol of ['imap','smtp']){const r=await operation(protocol,'stall-tls',{deadline:400});assert.notEqual(r.result.status,'accepted');assert.notEqual(r.result.status,'complete');assert.equal(r.peer.auth,0);assert(r.elapsed<2500);}
 for(const options of [{hostname:'mismatch.invalid'},{untrusted:true}]){const r=await operation('smtp','starttls-normal',{starttls:true,...options});assert.notEqual(r.result.status,'accepted');assert.equal(r.peer.auth,0);assert.equal(r.peer.bytes,0);}
 const body=await operation('smtp','normal',{slowBody:true,deadline:400});assert.equal(body.result.status,'unknown_delivery');assert(body.peer.bytes>0);assert.equal(body.peer.terminator,false);
 const final=await operation('smtp','trickle-final',{deadline:400});assert.equal(final.result.status,'unknown_delivery');assert.equal(final.peer.terminator,true);
});
test('guard mutations can fail',async()=>{
 const path=new URL('./imap.mutation.mjs',import.meta.url);const source=await readFile(new URL('./imap.mjs',import.meta.url),'utf8');await writeFile(path,source.replace('readOnly:true','readOnly:false'));
 try{const r=await operation('imap','normal',{},path);assert.throws(()=>assert(r.peer.commands.includes('EXAMINE')));}finally{await rm(path,{force:true});}
 const sourceS=await readFile(new URL('./smtp.mjs',import.meta.url),'utf8');const mutated=sourceS.replace("return 'unknown_delivery'","return 'accepted'");const pathS=new URL('./smtp.mutation.mjs',import.meta.url);await writeFile(pathS,mutated);
 try{const r=await operation('smtp','drop-final',{},pathS);assert.throws(()=>assert.equal(r.result.status,'unknown_delivery'));}finally{await rm(pathS,{force:true});}
 assert.equal(classify(new Error('closed')),'unknown_delivery');
});
test.after(async()=>{if(evidence)await writeFile(join(evidence,process.env.N7_SCENARIOS||'scenarios.json'),JSON.stringify(records,null,2));});
