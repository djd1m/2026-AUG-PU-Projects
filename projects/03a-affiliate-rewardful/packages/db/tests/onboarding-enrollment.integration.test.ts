import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile,stat,symlink } from 'node:fs/promises';
import pg from 'pg';
import { fixturePools,migrateFixture,newContext,resetOnboarding,bootstrap,register,owner,save,evidence,count,waitForLock,passwordHash } from './onboarding-test-helpers';
import { bootstrapPilotOwner } from '../../../scripts/bootstrap-pilot-owner';
import { createOnboardingService } from '../../../apps/web/src/lib/onboarding/service';
import { OnboardingRepository } from '../src/onboarding-repository';
import { hashGrantToken } from '../../../apps/web/src/lib/onboarding/identity';
const pools=fixturePools();const ctx=newContext(pools);
beforeAll(migrateFixture);beforeEach(()=>resetOnboarding(pools.migrate));afterAll(async()=>{await resetOnboarding(pools.migrate);await pools.app.end();await pools.migrate.end();});
it('offline bootstrap creates no user/session, replays receipt before opening output and rejects changed evidence/app authority',async()=>{
 const before=await count(pools.migrate,'users');const b=await bootstrap(ctx);
 expect(await count(pools.migrate,'users')).toBe(before);expect(await count(pools.migrate,'memberships')).toBe(0);
 expect((await pools.migrate.query('SELECT owner_id,status FROM n3a.programs')).rows).toEqual([{owner_id:null,status:'draft'}]);
 expect((await stat(b.outputPath)).mode&0o777).toBe(0o600);const initial=await readFile(b.outputPath,'utf8');
 const replay=await bootstrapPilotOwner({pool:pools.migrate,input:b.input,identitySecret:ctx.identitySecret,outputPath:b.outputPath});expect(replay.replayed).toBe(true);expect(await readFile(b.outputPath,'utf8')).toBe(initial);
 await expect(bootstrapPilotOwner({pool:pools.migrate,input:{...b.input,evidence:{...evidence,authority:{...evidence.authority,sha256:'c'.repeat(64)}}},identitySecret:ctx.identitySecret,outputPath:b.outputPath})).rejects.toMatchObject({code:'conflict'});
 await expect(pools.app.query('SELECT n3a.bootstrap_prepare($1,$2)',[JSON.stringify(b.input),randomBytes(32)])).rejects.toMatchObject({code:'42501'});
 await expect(bootstrapPilotOwner({pool:pools.migrate,input:{...b.input,request_id:randomUUID(),evidence:{}},identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-new'})).rejects.toMatchObject({code:'invalid_input'});
 expect(await count(pools.migrate,'programs')).toBe(1);expect(await count(pools.migrate,'enrollment_grants')).toBe(1);
});
it('explicit reissue is one chain tip and old/predecessor tokens cannot enroll',async()=>{
 const b=await bootstrap(ctx);const input={mode:'reissue',request_id:randomUUID(),program_id:b.program_id,previous_grant_id:b.grant_id,identity:b.input.identity,external_actor_ref:'fixture:reissue',evidence,expires_at:new Date(Date.now()+3600000).toISOString()};
 const result=await bootstrapPilotOwner({pool:pools.migrate,input,identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-replacement'});
 expect(result.program_id).toBe(b.program_id);await expect(register(ctx,b.input.identity,b.grant_token)).rejects.toMatchObject({code:'enrollment_unavailable'});
 await expect(bootstrapPilotOwner({pool:pools.migrate,input:{...input,request_id:randomUUID()},identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-duplicate'})).rejects.toMatchObject({code:'conflict'});
 const replacement=JSON.parse(await readFile(b.outputPath+'-replacement','utf8'));const account=await register(ctx,b.input.identity,replacement.grant_token);
 await ctx.service.acceptEnrollment({sessionTokenHash:account.sessionTokenHash,grant_token:replacement.grant_token});
 await expect(bootstrapPilotOwner({pool:pools.migrate,input:{...input,request_id:randomUUID(),previous_grant_id:result.grant_id},identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-third'})).rejects.toMatchObject({code:'conflict'});
});
it('two simultaneous normalized registrations create one identity/session and no membership or credential overwrite',async()=>{
 const b=await bootstrap(ctx);const results=await Promise.allSettled([register(ctx,'OWNER@PILOT.EXAMPLE',b.grant_token),register(ctx,' owner@pilot.example ',b.grant_token)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await count(pools.migrate,'memberships')).toBe(0);
 const rows=await pools.migrate.query('SELECT password_hash FROM n3a.users WHERE identity_hash=$1',[(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof register>>>).value.identityHash]);expect(rows.rows).toEqual([{password_hash:passwordHash}]);
 const account=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof register>>>).value;
 expect((await ctx.service.getMe({sessionTokenHash:account.sessionTokenHash})).memberships.items).toEqual([]);
 const accepted=await ctx.service.acceptEnrollment({sessionTokenHash:account.sessionTokenHash,grant_token:b.grant_token});
 expect(await ctx.service.acceptEnrollment({sessionTokenHash:account.sessionTokenHash,grant_token:b.grant_token})).toEqual(accepted);
});
it('revocation during paused KDF fails final grant check without identity creation or held pool client',async()=>{
 const b=await bootstrap(ctx);let release!:()=>void,entered!:()=>void;const pause=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const service=createOnboardingService({repository:ctx.repository,identitySecret:ctx.identitySecret,sessionSecret:ctx.sessionSecret,passwords:{hashPassword:async()=>{entered();await pause;return passwordHash;}}});
 const registering=service.register({identity:b.input.identity,password:'password123',grant_token:b.grant_token});const outcome=registering.catch(e=>e);
 await started;expect(pools.app.totalCount-pools.app.idleCount).toBe(0);
 await pools.migrate.query('UPDATE n3a.enrollment_grants SET revoked_at=clock_timestamp() WHERE id=$1',[b.grant_id]);release();
 expect(await outcome).toMatchObject({code:'enrollment_unavailable'});expect(await count(pools.migrate,'memberships')).toBe(0);
 expect((await pools.migrate.query('SELECT enrolled_user_id FROM n3a.enrollment_grants WHERE id=$1',[b.grant_id])).rows[0].enrolled_user_id).toBeNull();
});
it('operator grant scope ceiling and revoked membership replay cannot restore authority',async()=>{
 const o=await owner(ctx);await save(ctx,o);
 const issued=await ctx.service.issueEnrollment({...o,role:'operator',scopes:['read','payout'],identity:'operator@pilot.example',evidence,expires_at:new Date(Date.now()+3600000).toISOString()});
 const a=await register(ctx,'operator@pilot.example',issued.grant_token);const accepted=await ctx.service.acceptEnrollment({...a,grant_token:issued.grant_token});
 expect((await ctx.service.getProgram({...a,program_id:o.program_id})).scopes).toEqual(['read','payout']);
 await expect(ctx.service.savePolicy({...o,...(await import('./onboarding-test-helpers')).policy,sessionTokenHash:a.sessionTokenHash,expected_version:1,effective_mode:'now',acknowledged:true})).rejects.toMatchObject({code:'enrollment_unavailable'});
 await ctx.service.revokeOperator({...o,membership_id:accepted.membership_id});
 await expect(ctx.service.acceptEnrollment({...a,grant_token:issued.grant_token})).rejects.toMatchObject({code:'enrollment_unavailable'});
 expect((await ctx.service.getMe(a)).memberships.items).toHaveLength(0);
});
it('session revoke wins before SQL authorization lock; unrelated user lock wait uses fresh expiry after all locks',async()=>{
 const o=await owner(ctx);const c=await pools.migrate.connect();await c.query('BEGIN');await c.query('UPDATE n3a.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[o.sessionTokenHash]);
 const ap=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-session-wait',max:1,statement_timeout:5000});const repo=new OnboardingRepository(ap);
 const pending=repo.getProgram(o).catch(e=>e);await waitForLock(pools.app,'onboarding-session-wait');await c.query('COMMIT');c.release();expect(await pending).toMatchObject({code:'unauthorized'});await ap.end();
 // A new current session with short expiry waits on user AFTER session SHARE; post-all-lock decision must deny it.
 const sh=randomBytes(32);await pools.migrate.query("INSERT INTO n3a.sessions(user_id,token_hash,created_at,expires_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()+interval '300 milliseconds')",[o.user_id,sh]);
 const lock=await pools.migrate.connect();await lock.query('BEGIN');await lock.query('UPDATE n3a.users SET enabled=enabled WHERE id=$1',[o.user_id]);
 const ap2=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-user-wait',max:1,statement_timeout:5000});const pending2=new OnboardingRepository(ap2).getProgram({...o,sessionTokenHash:sh}).catch(e=>e);
 await waitForLock(pools.app,'onboarding-user-wait');await new Promise(r=>setTimeout(r,350));await lock.query('COMMIT');lock.release();expect(await pending2).toMatchObject({code:'unauthorized'});await ap2.end();
});
it('mutation holds session SHARE until commit, logout waits then denies every later mutation',async()=>{
 const o=await owner(ctx);const actor=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-mutation-first',max:1});
 const logout=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-logout-second',max:1});const c=await actor.connect();
 try{await c.query('BEGIN');await c.query('SELECT n3a.onboarding_save_policy($1,$2,$3)',[o.sessionTokenHash,o.program_id,JSON.stringify({...((await import('./onboarding-test-helpers')).policy),expected_version:0,effective_mode:'now',acknowledged:true})]);
 const revoked=logout.query('UPDATE n3a.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[o.sessionTokenHash]);
 await waitForLock(pools.app,'onboarding-logout-second');await c.query('COMMIT');await revoked;
 expect((await pools.migrate.query('SELECT count(*)::int AS n FROM n3a.policy_versions')).rows[0].n).toBe(1);
 await expect(ctx.service.issueEnrollment({...o,role:'operator',scopes:['read'],identity:'after-logout@pilot.example',evidence,expires_at:new Date(Date.now()+3600000).toISOString()})).rejects.toMatchObject({code:'unauthorized'});
 }finally{await c.query('ROLLBACK');c.release();await actor.end();await logout.end();}
});
it('bootstrap replacement and owner acceptance serialize in both orders without a second usable tip',async()=>{
 for(const first of ['accept','reissue']){
 await resetOnboarding(pools.migrate);const b=await bootstrap(ctx);const a=await register(ctx,b.input.identity,b.grant_token);
 const input={mode:'reissue',request_id:randomUUID(),program_id:b.program_id,previous_grant_id:b.grant_id,identity:b.input.identity,external_actor_ref:'fixture:race',evidence,expires_at:new Date(Date.now()+3600000).toISOString()};
 if(first==='accept'){
 const c=await pools.app.connect();const offline=new pg.Pool({connectionString:pools.urls.migrate,application_name:'onboarding-reissue-second',max:1});
 try{await c.query('BEGIN');await c.query('SELECT n3a.onboarding_accept($1,$2)',[a.sessionTokenHash,hashGrantToken(b.grant_token)]);
 const pending=bootstrapPilotOwner({pool:offline,input,identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-race'}).catch(e=>e);
 await waitForLock(pools.migrate,'onboarding-reissue-second');await c.query('COMMIT');expect(await pending).toMatchObject({code:'conflict'});
 expect(await count(pools.migrate,'bootstrap_receipts')).toBe(1);
 }finally{await c.query('ROLLBACK');c.release();await offline.end();}
 }else{
 const c=await pools.migrate.connect();const actor=new pg.Pool({connectionString:pools.urls.app,application_name:'onboarding-accept-second',max:1});
 try{await c.query('BEGIN');await c.query('SELECT n3a.bootstrap_apply($1,$2,$3,$4)',[JSON.stringify(input),randomBytes(32),a.identityHash,randomBytes(32)]);
 const pending=new OnboardingRepository(actor).acceptEnrollment({sessionTokenHash:a.sessionTokenHash,grantHash:hashGrantToken(b.grant_token)}).catch(e=>e);
 await waitForLock(pools.app,'onboarding-accept-second');await c.query('COMMIT');expect(await pending).toMatchObject({code:'enrollment_unavailable'});
 expect(await count(pools.migrate,'bootstrap_receipts')).toBe(2);expect(await count(pools.migrate,'memberships')).toBe(0);
 }finally{await c.query('ROLLBACK');c.release();await actor.end();}
 }
 }
});
it('issuer authority is current at acceptance and replay, while established membership survives issuer loss',async()=>{
 const o=await owner(ctx);const grant=await ctx.service.issueEnrollment({...o,role:'operator',scopes:['read'],identity:'invited-operator@pilot.example',evidence,expires_at:new Date(Date.now()+3600000).toISOString()});
 const a=await register(ctx,'invited-operator@pilot.example',grant.grant_token);
 await pools.migrate.query("UPDATE n3a.memberships SET status='revoked' WHERE id=$1",[o.membership_id]);
 await expect(ctx.service.acceptEnrollment({...a,grant_token:grant.grant_token})).rejects.toMatchObject({code:'enrollment_unavailable'});
 expect(await count(pools.migrate,'memberships')).toBe(1);
 await pools.migrate.query("UPDATE n3a.memberships SET status='active' WHERE id=$1",[o.membership_id]);await ctx.service.acceptEnrollment({...a,grant_token:grant.grant_token});
 await pools.migrate.query('UPDATE n3a.users SET enabled=false WHERE id=$1',[o.user_id]);
 await expect(ctx.service.acceptEnrollment({...a,grant_token:grant.grant_token})).rejects.toMatchObject({code:'enrollment_unavailable'});
 expect((await ctx.service.getProgram({...a,program_id:o.program_id})).role).toBe('operator');
});
it('expiry during KDF and foreign identities never bind or create credentials',async()=>{
 const b=await bootstrap(ctx);await expect(register(ctx,'foreign@pilot.example',b.grant_token)).rejects.toMatchObject({code:'enrollment_unavailable'});
 let release!:()=>void,entered!:()=>void;const paused=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const service=createOnboardingService({repository:ctx.repository,identitySecret:ctx.identitySecret,sessionSecret:ctx.sessionSecret,passwords:{hashPassword:async()=>{entered();await paused;return passwordHash;}}});
 const pending=service.register({identity:b.input.identity,password:'password123',grant_token:b.grant_token}).catch(e=>e);
 await started;await pools.migrate.query("UPDATE n3a.enrollment_grants SET expires_at=clock_timestamp() WHERE id=$1",[b.grant_id]);release();
 expect(await pending).toMatchObject({code:'enrollment_unavailable'});expect((await pools.migrate.query('SELECT enrolled_user_id FROM n3a.enrollment_grants')).rows[0].enrolled_user_id).toBeNull();
});
it('owner assignment rolls back when membership insertion fails and private output refuses symlinks',async()=>{
 const b=await bootstrap(ctx);const a=await register(ctx,b.input.identity,b.grant_token);
 await pools.migrate.query("CREATE FUNCTION n3a.fixture_owner_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owner_member_failure';END $$");
 await pools.migrate.query('CREATE TRIGGER fixture_owner_fail AFTER INSERT ON n3a.memberships FOR EACH ROW EXECUTE FUNCTION n3a.fixture_owner_fail()');
 try{await expect(ctx.service.acceptEnrollment({...a,grant_token:b.grant_token})).rejects.toMatchObject({code:'unavailable'});
 expect((await pools.migrate.query('SELECT owner_id FROM n3a.programs')).rows[0].owner_id).toBeNull();expect(await count(pools.migrate,'memberships')).toBe(0);
 expect((await pools.migrate.query('SELECT consumed_at FROM n3a.enrollment_grants')).rows[0].consumed_at).toBeNull();
 }finally{await pools.migrate.query('DROP TRIGGER fixture_owner_fail ON n3a.memberships');await pools.migrate.query('DROP FUNCTION n3a.fixture_owner_fail()');}
 const original=await readFile(b.outputPath,'utf8');await symlink(b.outputPath,b.outputPath+'-symlink');
 const input={mode:'reissue',request_id:randomUUID(),program_id:b.program_id,previous_grant_id:b.grant_id,identity:b.input.identity,external_actor_ref:'fixture:symlink',evidence,expires_at:new Date(Date.now()+3600000).toISOString()};
 await expect(bootstrapPilotOwner({pool:pools.migrate,input,identitySecret:ctx.identitySecret,outputPath:b.outputPath+'-symlink'})).rejects.toMatchObject({code:'unavailable'});
 expect(await readFile(b.outputPath,'utf8')).toBe(original);expect(await count(pools.migrate,'bootstrap_receipts')).toBe(1);
 await ctx.service.acceptEnrollment({...a,grant_token:b.grant_token});
});
