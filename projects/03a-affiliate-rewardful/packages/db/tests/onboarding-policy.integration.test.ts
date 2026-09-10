import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import pg from 'pg';
import { fixturePools,migrateFixture,newContext,resetOnboarding,owner,save,policy,partner,count,waitForLock } from './onboarding-test-helpers';
import { OnboardingRepository } from '../src/onboarding-repository';
import { hashGrantToken } from '../../../apps/web/src/lib/onboarding/identity';
const pools=fixturePools(),ctx=newContext(pools);
beforeAll(migrateFixture);beforeEach(()=>resetOnboarding(pools.migrate));afterAll(async()=>{await resetOnboarding(pools.migrate);await pools.app.end();await pools.migrate.end();});
it('expected version races insert one immutable version and activation is always closed',async()=>{
 const o=await owner(ctx);const initial={...o,...policy,expected_version:0,effective_mode:'now' as const,acknowledged:true as const};
 const attempts=await Promise.allSettled([ctx.service.savePolicy(initial),ctx.service.savePolicy({...initial,rate_bp:2000})]);expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 const program=await ctx.service.getProgram(o);expect(program.latest_version).toBe(1);expect(program.timezone).toBe(policy.timezone);expect(program.program_status).toBe('draft');
 await expect(ctx.service.activateProgram(o)).rejects.toMatchObject({code:'integration_not_ready'});expect((await ctx.service.getProgram(o)).calendar_locked_at).toBeNull();
 await expect(pools.app.query('UPDATE n3a.policy_versions SET rate_bp=1')).rejects.toMatchObject({code:'42501'});
});
it('future policy retains paired current timezone, cannot accept future terms, and paused calendar stays locked',async()=>{
 const o=await owner(ctx);await save(ctx,o);const before=await ctx.service.getProgram(o);
 const next=await ctx.service.savePolicy({...o,...policy,timezone:'UTC',expected_version:1,effective_mode:'future',effective_at:new Date(Date.now()+60000).toISOString(),acknowledged:true});
 const current=await ctx.service.getProgram(o);expect(current.current_policy).toEqual(before.current_policy);expect(current.timezone).toBe('Europe/Moscow');expect(current.latest_version).toBe(2);
 const p=await partner(ctx,o);await expect(ctx.service.acceptPartner({...p.acceptance,policy_id:next.policy_id})).rejects.toMatchObject({code:'terms_changed'});expect(await count(pools.migrate,'partner_assets')).toBe(0);
 await pools.migrate.query("UPDATE n3a.programs SET status='paused',calendar_locked_at=clock_timestamp(),timezone='Europe/Moscow' WHERE id=$1",[o.program_id]);
 await expect(ctx.service.savePolicy({...o,...policy,timezone:'UTC',expected_version:2,effective_mode:'future',effective_at:new Date(Date.now()+120000).toISOString(),acknowledged:true})).rejects.toMatchObject({code:'conflict'});
});
it('waiting across scheduled effectiveness rejects stale consent with no partial writes',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);
 await ctx.service.savePolicy({...o,...policy,terms_text:'New scheduled terms',expected_version:1,effective_mode:'future',effective_at:new Date(Date.now()+400).toISOString(),acknowledged:true});
 const lock=await pools.migrate.connect();await lock.query('BEGIN');await lock.query('SELECT id FROM n3a.programs WHERE id=$1 FOR UPDATE',[o.program_id]);
 const app=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-policy-wait',statement_timeout:5000,max:1});
 const pending=new OnboardingRepository(app).acceptPartner({...p.acceptance,grantHash:hashGrantToken(p.grant_token)}).catch(e=>e);
 await waitForLock(pools.app,'onboarding-policy-wait');await new Promise(r=>setTimeout(r,450));await lock.query('COMMIT');lock.release();
 expect(await pending).toMatchObject({code:'terms_changed'});expect(await count(pools.migrate,'partner_assets')).toBe(0);await app.end();
 const preview=await ctx.service.previewEnrollment(p.acceptance);expect(preview.policy?.terms_text).toBe('New scheduled terms');
});
