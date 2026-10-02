import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseKeyring,encryptCredentials,decryptCredentials } from '../src/mailboxes/crypto.js';
import { isPublicIp,normalizeHost,resolveEndpoint,deadline } from '../src/mailboxes/network.js';
import { parseMailbox } from '../src/mailboxes/input.js';
import { verifyTest } from '../src/mailboxes/provider.js';
import { HttpError } from '../src/errors.js';
const session=randomBytes(32);const v1=randomBytes(32).toString('base64');const v2=randomBytes(32).toString('base64');
const ring=parseKeyring(JSON.stringify({activeVersion:'v1',keys:{v1,v2}}),session);
const allowlist=new Map([['smtp.example.com',7],['imap.example.com',8]]);
const settings={smtpHost:'smtp.example.com',smtpPort:587 as const,imapHost:'imap.example.com',imapPort:993 as const};
const credentials={smtpUsername:'owner',smtpPassword:'secret',imapUsername:'owner',imapPassword:'secret'};
const publicDns=async()=>[{address:'8.8.8.8',family:4}];
test('AEAD fresh nonce, ciphertext/tag/AAD substitution and retained versions fail closed before transport',()=>{
  const tenant=randomUUID(),id=randomUUID();const canary='N7_CREDENTIAL_CANARY_'+randomBytes(16).toString('hex');
  const value={...credentials,smtpPassword:canary};const first=encryptCredentials(value,tenant,id,ring);const second=encryptCredentials(value,tenant,id,ring);
  assert.notEqual(first.nonce,second.nonce);assert.ok(!JSON.stringify(first).includes(canary));
  assert.deepEqual(decryptCredentials(first,tenant,id,ring),value);
  const rotated=parseKeyring(JSON.stringify({activeVersion:'v2',keys:{v1,v2}}),session);
  assert.deepEqual(decryptCredentials(first,tenant,id,rotated),value);assert.equal(encryptCredentials(value,tenant,id,rotated).version,'v2');
  for(const [envelope,t,m] of [[first,randomUUID(),id],[first,tenant,randomUUID()],[{...first,version:'unknown'},tenant,id],[{...first,tag:Buffer.alloc(16).toString('base64')},tenant,id],[{...first,ciphertext:second.ciphertext},tenant,id]] as const) {
    assert.throws(()=>decryptCredentials(envelope,t,m,ring),e=>e instanceof HttpError && e.code==='credential_unavailable' && !String(e).includes(canary));
  }
  for(const raw of ['', '{}',JSON.stringify({activeVersion:'v1',keys:{v1:session.toString('base64')}}),JSON.stringify({activeVersion:'missing',keys:{v1}}),JSON.stringify({activeVersion:'v1',keys:{v1:'malformed'}})]) assert.throws(()=>parseKeyring(raw,session));
});
test('operator host normalization and conservative public address oracle',async()=>{
  assert.equal(normalizeHost('SMTP.EXAMPLE.COM.'),'smtp.example.com');
  for(const host of ['localhost','127.0.0.1','[::1]','smtp.example.com:25','user@smtp.example.com','smtp.example.com/path',' smtp.example.com','a..com','-a.com']) assert.throws(()=>normalizeHost(host));
  for(const ip of ['0.0.0.0','10.1.2.3','100.64.1.1','127.1.2.3','169.254.169.254','172.16.0.1','192.168.1.1','192.0.2.1','198.18.1.1','198.51.100.2','203.0.113.2','224.1.1.1','240.0.0.1','255.255.255.255','::','::1','fe80::1','fc00::1','ff00::1','::ffff:8.8.8.8','::ffff:0808:0808','2001:db8::1','2001::1','2002:0808:0808::1','3fff::1']) assert.equal(isPublicIp(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888']) assert.equal(isPublicIp(ip),true,ip);
  await assert.rejects(resolveEndpoint('foreign.example.com',465,allowlist,publicDns));
  for(const records of [[],[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],[{address:'::ffff:8.8.8.8',family:6}],[{address:'8.8.8.8',family:6}]]) await assert.rejects(resolveEndpoint(settings.smtpHost,465,allowlist,async()=>records));
});
test('IANA reserved and unallocated IPv6 reject before any adapter call, alone or mixed',async()=>{
  // Explicit RESERVED entries and gaps between ALLOCATED entries (IANA 2025-10-10).
  const reserved=['2000::1','2001:1000::1','2001:11ff:ffff:ffff:ffff:ffff:ffff:ffff',
    '2001:4e00::1','2001:4fff::1','2001:6000::1','2001:7fff::1','2001:c000::1',
    '2003:4000::1','23ff:ffff::1','2420::1','25ff:ffff::1','2610:200::1',
    '261f:ffff::1','2620:200::1','262f:ffff::1','2640::1','27ff:ffff::1',
    '2810::1','29ff:ffff::1','2a20::1','2bff:ffff::1','2c10::1','2cff:ffff::1',
    '2d00::1','2e00::1','3000::1','3800::1','3c00::1','3e00::1','3f00::1',
    '3f80::1','3fc0::1','3fe0::1','3ff0::1','3ff8::1','3ffc::1','3ffe::1',
    '3fff::1','3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'];
  let calls=0;
  const adapter={mode:'local_test' as const,async connect(){calls++;}};
  for(const address of reserved) {
    assert.equal(isPublicIp(address),false,address);
    const unsafe={address,family:6};const publicAnswer={address:'8.8.8.8',family:4};
    for(const records of [[unsafe],[publicAnswer,unsafe],[unsafe,publicAnswer]]) {
      const dns=async()=>records;
      await assert.rejects(resolveEndpoint(settings.smtpHost,587,allowlist,dns),e=>e instanceof HttpError && e.code==='unsafe_address',address);
      await assert.rejects(verifyTest(settings,credentials,allowlist,adapter,dns),e=>e instanceof HttpError && e.code==='unsafe_address',address);
      assert.equal(calls,0,address);
    }
  }
  // Allocated boundaries include recent APNIC/RIPE allocations and narrow ARIN blocks.
  for(const address of ['2001:200::1','2001:fff::1','2001:1200::1','2001:4dff::1',
    '2001:5000::1','2001:5fff::1','2001:8000::1','2001:bfff::1','2003::1',
    '2003:3fff::1','2400::1','241f:ffff::1','2600::1','260f:ffff::1',
    '2610::1','2610:1ff::1','2620::1','2620:1ff::1','2630::1','263f:ffff::1',
    '2800::1','280f:ffff::1','2a00::1','2a1f:ffff::1','2c00::1','2c0f:ffff::1']) {
    assert.equal(isPublicIp(address),true,address);
    assert.equal(await verifyTest(settings,credentials,allowlist,adapter,async()=>[{address,family:6}]),'verified_test');
  }
  assert.equal(calls,52);
});
test('save input enforces TLS ports and limits',()=>{
  const raw={...settings,...credentials,label:'Mailbox',senderAddress:'Owner@example.com',requiredTLS:true};
  assert.equal(parseMailbox(raw).dailyLimit,10);
  for(const patch of [{smtpPort:25},{imapPort:143},{requiredTLS:false},{dailyLimit:31},{dailyLimit:0},{smtpPassword:'line\r\ninjection'}]) assert.throws(()=>parseMailbox({...raw,...patch}));
});
test('connector revalidation, IP pin/TLS identity, canary scrub and abort deadlines',async()=>{
  let resolves=0,calls=0;const canary='N7_CREDENTIAL_CANARY_'+randomBytes(16).toString('hex');
  const adapter={mode:'local_test' as const,async connect(protocol:'smtp'|'imap',endpoint:Awaited<ReturnType<typeof resolveEndpoint>>) {
    calls++;assert.equal(endpoint.address,'8.8.8.8');assert.equal(endpoint.servername,protocol==='smtp'?settings.smtpHost:settings.imapHost);
    assert.equal(endpoint.rejectUnauthorized,true);assert.equal(endpoint.requiredTLS,true);assert.equal(endpoint.connectTimeoutMs,10000);
  }};
  const dns=async()=>{resolves++;return publicDns();};
  assert.equal(await verifyTest(settings,credentials,allowlist,adapter,dns),'verified_test');
  assert.equal(await verifyTest(settings,credentials,allowlist,adapter,dns),'verified_test');assert.equal(resolves,4);assert.equal(calls,4);
  await assert.rejects(verifyTest(settings,credentials,allowlist,{mode:'local_test',async connect(){throw new Error(canary);}},publicDns),e=>e instanceof HttpError && e.code==='provider_failed' && !JSON.stringify(e).includes(canary) && !String(e).includes(canary));
  calls=0;await assert.rejects(verifyTest(settings,credentials,allowlist,adapter,async()=>[{address:'127.0.0.1',family:4}]));assert.equal(calls,0);
  let aborted=false;const start=Date.now();
  await assert.rejects(deadline(20,signal=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))),e=>e instanceof HttpError && e.code==='provider_timeout');
  assert.equal(aborted,true);assert.ok(Date.now()-start<500);
});
