import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compose, labelPixels, createCompositeCache } from '../web/composite.js';
import { sha } from '../web/generation.js';
async function dark(data,left,top,width,height) {
  const pixels=await sharp(data).extract({left,top,width,height}).removeAlpha().raw().toBuffer();
  return [...pixels].filter(v=>v<100).length;
}
test('bounded real composite pixels: before/after, permanent AI, effective badge and mandatory DEMO',async()=>{
  const before=await sharp({create:{width:8,height:6,channels:3,background:'#f00'}}).webp().toBuffer();
  const after=await sharp({create:{width:8,height:6,channels:3,background:'#00f'}}).png().toBuffer();
  for(const [badgeFree,mode,quality] of [[false,'controlnet','accepted'],[true,'controlnet','accepted'],[true,'fixture','unverified'],[false,'controlnet','unverified']]) {
    const result=await compose(before,after,{badgeFree,mode,quality});
    const m=await sharp(result.data).metadata();assert.equal(m.width,2048);assert.equal(m.height,868);assert.equal(m.exif,undefined);
    assert.equal(result.sha,sha(result.data));assert.ok(result.data.length<8*1024*1024);
    assert.ok(await dark(result.data,24,824,198,21)>300,'AI REDESIGN has visible pixels');
    assert.equal(await dark(result.data,1800,824,144,21)>100,!badgeFree,'ROOMKIND pixel badge follows server entitlement');
    if(mode==='fixture')assert.ok(await dark(result.data,1048,824,270,21)>400,'DEMO UNVERIFIED cannot be removed');
    const raw=await sharp(result.data).raw().toBuffer();
    assert.ok(raw[(300*2048+400)*3]>200);assert.ok(raw[(300*2048+1400)*3+2]>200);
  }
  assert.throws(()=>labelPixels('not-supported'));
  await assert.rejects(compose(Buffer.alloc(10485761),after,{mode:'controlnet',quality:'accepted'}));
  const cache=createCompositeCache();const options={mode:'fixture',quality:'unverified'};
  const concurrent=await Promise.all([cache.get('concurrent',before,after,options),cache.get('concurrent',before,after,options)]);
  assert.equal(concurrent[0],concurrent[1]);
  assert.equal(await cache.get('key',before,after,options),await cache.get('key',before,after,options));
});
