import test from 'node:test';
import assert from 'node:assert/strict';
const {installActions}=await import(process.env.UI_ACTIONS_TEST_MODULE??new URL('../web/public/ui-actions.js',import.meta.url));
function harness(mode,quality,held=false) {
  const elements=new Map(),posts=[];let pending;
  const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,checked:false,value:'',textContent:'',removeAttribute(){}});return elements.get(id);};
  const job={job_id:'jobA',mode,quality,style:'warm'},account={id:'owner',billing_hold:held};
  const actions=installActions({$,api:async()=>({published:false,available:false}),post:async(path,body)=>{posts.push({path,body});return {};},
    scope:{},status(){},balance(){},guard:work=>{pending=work();},getAccount:()=>account,getJob:()=>job,getPaymentIntent:()=>null});
  return {$,posts,job,account,actions,submit:()=>{$('publication-form').onsubmit({preventDefault(){}});return pending;}};
}
test('accepted controlnet and replicate each require separate consent before actual publication action',async()=>{
  for(const mode of ['controlnet','replicate']) {
    const h=harness(mode,'accepted');await h.actions.publication(h.job);
    assert.equal(h.$('publish-consent').disabled,false);assert.equal(h.$('publish').disabled,true);
    await assert.rejects(h.submit(),/отдельное согласие/);assert.equal(h.posts.length,0);
    h.$('publish-consent').checked=true;h.$('publish-consent').onchange();assert.equal(h.$('publish').disabled,false);
    await h.submit();assert.equal(h.posts.length,1);assert.equal(h.posts[0].path,'/api/jobs/jobA/publication');assert.equal(h.posts[0].body.publish,true);
  }
});
test('unverified hosted result must never enable publication even with forged checked consent',async()=>{
  const h=harness('replicate','unverified');await h.actions.publication(h.job);
  assert.equal(h.$('publish-consent').disabled,true,'HOSTED-UNVERIFIED must disable consent');
  h.$('publish-consent').checked=true;h.$('publish-consent').onchange();assert.equal(h.$('publish').disabled,true);
  await assert.rejects(h.submit());assert.equal(h.posts.length,0);
});
test('fixture, unknown mode/quality, rejected and held accepted results preserve publication guards',async()=>{
  for(const [mode,quality,held] of [['fixture','accepted',false],['replicate','rejected',false],['replicate',null,false],
    ['other','accepted',false],['replicate','accepted',true],['controlnet','accepted',true]]) {
    const h=harness(mode,quality,held);await h.actions.publication(h.job);
    assert.equal(h.$('publish-consent').disabled,true);assert.equal(h.$('publish').disabled,true);
    h.$('publish-consent').checked=true;await assert.rejects(h.submit());assert.equal(h.posts.length,0);
  }
});
