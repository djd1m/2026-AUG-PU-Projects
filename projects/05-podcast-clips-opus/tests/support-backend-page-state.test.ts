import {beforeEach,describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({token:undefined as string|undefined,query:vi.fn(),mode:'disabled' as 'disabled'|'test',hash:vi.fn(()=> 'private-hash')}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>fixture.token?{value:fixture.token}:undefined})}));
vi.mock('../apps/web/src/server/runtime',()=>({getRuntime:()=>({config:{mail:{mode:'disabled'},support:{mode:fixture.mode,baseURL:null,inboxID:null,identifiedEnabled:false,contactEmail:null,synthetic:false,secret:'private-secret'}},pool:{query:fixture.query},auth:{tokenHash:fixture.hash}})}));
import {supportPageState} from '../apps/web/src/server/support/page-state';
beforeEach(()=>{fixture.token=undefined;fixture.mode='disabled';fixture.query.mockReset();fixture.hash.mockClear();});
describe('typed support SSR seam',()=>{
 it('anonymous disabled state requires no DB lookup and reveals no credential',async()=>{
  const state=await supportPageState();expect(state).toEqual({account:null,operator:false,mailAvailable:false,support:{mode:'disabled',baseURL:null,inboxID:null,identifiedEnabled:false,contactEmail:null,synthetic:false}});
  expect(fixture.query).not.toHaveBeenCalled();expect(JSON.stringify(state)).not.toMatch(/secret|hash|token/);
 });
 it('projects only current account proof and membership',async()=>{
  fixture.token='A'.repeat(43);fixture.query.mockResolvedValue({rows:[{id:'id',email:'synthetic@example.test',verified:true,operator:true,password_hash:'never-project'}]});
  const state=await supportPageState();expect(state.account).toEqual({id:'id',email:'synthetic@example.test',verified:true});expect(state.operator).toBe(true);expect(JSON.stringify(state)).not.toContain('never-project');
 });
 it('fails closed when current authority lookup fails',async()=>{
  fixture.token='A'.repeat(43);fixture.query.mockRejectedValue(new Error('synthetic database failure'));
  const state=await supportPageState();expect(state.account).toBeNull();expect(state.operator).toBe(false);
 });
});
