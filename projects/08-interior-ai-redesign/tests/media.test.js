import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { cookie, DUMMY_HASH, newSession, passwordInput, tokenHash, TTL_SECONDS } from '../web/auth.js';
import { imageType, MAX_BYTES, MAX_PIXELS, normalizeImage } from '../web/media.js';

const pixel = sharp({create:{width:4,height:3,channels:3,background:'#ad6847'}});
test('AUTH-02 random 32-byte token, HMAC-only record and cookie flags',() => {
  const secret=randomBytes(32).toString('hex'); const before=Date.now(); const a=newSession(secret); const b=newSession(secret);
  assert.equal(Buffer.from(a.token,'base64url').length,32); assert.notEqual(a.token,b.token);
  assert.equal(a.hash,tokenHash(a.token,secret)); assert.notEqual(a.hash,a.token);
  assert.ok(a.expires.getTime()>=before+TTL_SECONDS*1000);
  assert.ok(a.expires.getTime()<=Date.now()+TTL_SECONDS*1000);
  for (const secure of [true,false]) {
    const header=cookie(a.token,secure); assert.match(header,/HttpOnly; SameSite=Lax; Max-Age=604800/); assert.equal(header.includes('; Secure'),secure);
  }
  assert.match(cookie('',true,true),/Max-Age=0; Secure/);
});
test('AUTH-01 all 128 Unicode characters affect bcrypt; dummy hash uses cost 10',async () => {
  const password='я'.repeat(128); const hash=await bcrypt.hash(passwordInput(password),10);
  assert.equal(await bcrypt.compare(passwordInput(password),hash),true);
  assert.equal(await bcrypt.compare(passwordInput('я'.repeat(127)+'ю'),hash),false);
  assert.equal(bcrypt.getRounds(DUMMY_HASH),10);
});
test('UPLOAD-01 JPEG/PNG/WebP real decode, matching magic and invalid/truncated data',async () => {
  for (const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
    const bytes=await pixel.clone()[format]().toBuffer(); assert.equal(imageType(bytes),mime);
    const result=await normalizeImage(bytes,mime); assert.equal(result.width,4); assert.equal(result.height,3); assert.equal(result.mime,'image/webp');
    assert.equal((await sharp(result.data).metadata()).exif,undefined);
    await assert.rejects(normalizeImage(bytes,mime==='image/png'?'image/jpeg':'image/png'),error=>error.status===422);
    await assert.rejects(normalizeImage(bytes.subarray(0,12),mime),error=>error.status===422);
    await assert.rejects(normalizeImage(Buffer.concat([bytes,Buffer.alloc(MAX_BYTES+1-bytes.length)]),mime),error=>error.status===413);
  }
});
test('UPLOAD-01 exact byte limit and orientation normalization strips EXIF',async () => {
  const png=await pixel.clone().png().toBuffer();
  const exact=Buffer.concat([png,Buffer.alloc(MAX_BYTES-png.length)]);
  assert.equal((await normalizeImage(exact,'image/png')).width,4);
  const oriented=await pixel.clone().jpeg().withMetadata({orientation:6}).toBuffer();
  const result=await normalizeImage(oriented,'image/jpeg'); assert.equal(result.width,3); assert.equal(result.height,4);
  const metadata=await sharp(result.data).metadata(); assert.equal(metadata.exif,undefined); assert.equal(metadata.orientation,undefined);
});
test('UPLOAD-01 exact 20MP and one-row beyond for each allowed format',async () => {
  assert.equal(MAX_PIXELS,20000000);
  for (const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
    const exact=await sharp({create:{width:5000,height:4000,channels:3,background:'#ffffff'}})[format]().toBuffer();
    const result=await normalizeImage(exact,mime); assert.equal(result.width*result.height,MAX_PIXELS);
    const over=await sharp({create:{width:5000,height:4001,channels:3,background:'#ffffff'}})[format]().toBuffer();
    await assert.rejects(normalizeImage(over,mime),error=>error.status===413);
  }
});
