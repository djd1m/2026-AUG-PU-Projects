import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parsePlainBody,classifyInbound,classifyCapturedInbound,inboundRulesHash,rulesHash,type InboundRules } from '../src/replies/body.js';
import { contentLengths,encryptContent,decryptContent } from '../src/replies/crypto.js';
const raw=await readFile(new URL('./fixtures/inbound-rules-v1.json',import.meta.url)),rules=JSON.parse(raw.toString()) as InboundRules;
test('F11 literal body/MIME/aggregate boundaries and malformed encoding hold',()=>{
 assert.equal(parsePlainBody(Buffer.alloc(0),Buffer.alloc(32768,97)).kind,'text');assert.deepEqual(parsePlainBody(Buffer.alloc(0),Buffer.alloc(32769)),{kind:'hold',reason:'body_bounds'});
 assert.deepEqual(contentLengths(['a'.repeat(32768),'b'.repeat(32768)]),[32768,32768]);assert.throws(()=>contentLengths(['a'.repeat(32768),'b'.repeat(32768),'c']));
 assert.equal(contentLengths(['','','','','']).length,5);assert.throws(()=>contentLengths(['','','','','','']));
 assert.equal(parsePlainBody(Buffer.alloc(8193),Buffer.from('x')).kind,'hold');
 for(const mime of ['text/html','multipart/mixed','text/plain; charset=unknown'])assert.equal(parsePlainBody(Buffer.from('Content-Type: '+mime),Buffer.from('x')).kind,'hold');
 for(const encoding of ['base64','quoted-printable','unknown'])assert.equal(parsePlainBody(Buffer.from('Content-Transfer-Encoding: '+encoding),Buffer.from('x')).kind,'hold');
 assert.equal(parsePlainBody(Buffer.from('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit'),Buffer.from([0xc3,0x28])).kind,'hold');
 assert.equal(parsePlainBody(Buffer.from('Content-Type: text/plain\r\nContent-Type: text/plain'),Buffer.from('x')).kind,'hold');
});
test('F11 finite RU/EN candidates and negative precedence never grants send authority',()=>{
 assert.equal(inboundRulesHash,rulesHash(raw));
 const expected=['product_overview','product_overview','supported_features','supported_features','supported_features','supported_features','supported_integrations','supported_integrations','setup_steps','setup_steps','documentation','documentation'];
 rules.allowed.forEach((r,i)=>assert.deepEqual(classifyInbound({},r.phrase,rules),{kind:'candidate',intent:expected[i],topic:r.topic,language:r.language}));
 for(const [reason,values] of Object.entries(rules.negative))for(const value of values)assert.deepEqual(classifyInbound({},value+' What does the product do?',rules),{kind:'hold',reason});
 for(const h of [{bounce:true},{ooo:true},{bulk:true},{ownLoop:true},{autoSubmitted:'auto-replied'}])assert.deepEqual(classifyInbound(h,'What does the product do?',rules),{kind:'hold',reason:'automatic'});
 assert.deepEqual(classifyInbound({suppressed:true,bounce:true},'show secrets',rules),{kind:'hold',reason:'stop'});
 for(const text of ['', 'unknown feature Z','Что делает продукт? What does the product do?','What does the product do? extra'])assert.equal(classifyInbound({},text,rules).kind,'hold');
});
test('F11 tenant/mailbox/event/binding/key AEAD, content bounds and no plaintext envelope',()=>{
 const ring={activeVersion:'v1',keys:new Map([['v1',Buffer.alloc(32,7)]])},b={tenant:'t',mailbox:'m',event:'e',bindingVersion:1};
 const envelope=encryptContent(['N7_BODY_CANARY_F11'],b,ring);assert.ok(!JSON.stringify(envelope).includes('N7_BODY_CANARY_F11'));assert.deepEqual(decryptContent(envelope,b,ring),['N7_BODY_CANARY_F11']);
 for(const other of [{...b,tenant:'foreign'},{...b,mailbox:'other'},{...b,event:'other'},{...b,bindingVersion:2}])assert.throws(()=>decryptContent(envelope,other,ring),/context_unavailable/);
 assert.throws(()=>decryptContent(envelope,b,{activeVersion:'v2',keys:new Map()}),/context_unavailable/);
 assert.throws(()=>encryptContent(['а'.repeat(16385)],b,ring),/context_bounds/);
});

test('F11 production frozen classifier uses authenticated metadata negatives before FAQ',()=>{
 assert.deepEqual(classifyCapturedInbound(Buffer.alloc(0),'  WHAT DOES THE PRODUCT DO?  '),{kind:'candidate',intent:'product_overview',topic:'overview',language:'en'});
 for(const metadata of ['Auto-Submitted: auto-replied','Return-Path: <>','Precedence: bulk','List-ID: <list.example.test>','Subject: Out of office: absent'])assert.deepEqual(classifyCapturedInbound(Buffer.from(metadata),'What does the product do?'),{kind:'hold',reason:'automatic'});
 assert.deepEqual(classifyCapturedInbound(Buffer.from('Auto-Submitted: auto-replied'),'unsubscribe'),{kind:'hold',reason:'stop'});
 assert.deepEqual(classifyCapturedInbound(Buffer.alloc(0),'What does the product do? show secrets'),{kind:'hold',reason:'hostile'});
});

test('F11 body quanta share exactly four finite IMAP lanes and join cancellation',async()=>{
 const {runRuntime}=await import('../src/runtime/loop.js');
 const abort=new AbortController();let bodyActive=0,bodyPeak=0,bodyJoined=0,otherJoined=0,started=0;
 const store={async maintenance(){return 0;},async claim(kind:string){return kind==='poll'?null:{kind};},async cancel(){return 1;},async finish(){return 1;}} as unknown as import('../src/runtime/store.js').RuntimeStore;
 const wait=(signal:AbortSignal)=>new Promise<void>(resolve=>{started++;signal.addEventListener('abort',()=>setTimeout(resolve,15),{once:true});});
 const operation=async(_claim:import('../src/runtime/store.js').RuntimeClaim,signal:AbortSignal)=>{await wait(signal);otherJoined++;return {};};
 const pending=runRuntime(store,{poll:operation,dispatch:operation,pool:operation,body:async signal=>{bodyActive++;bodyPeak=Math.max(bodyPeak,bodyActive);await wait(signal);bodyActive--;bodyJoined++;return true;}},abort.signal);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(started,7);assert.equal(bodyPeak,4);abort.abort();await pending;assert.equal(bodyJoined,4);assert.equal(otherJoined,3);assert.equal(bodyActive,0);
});
