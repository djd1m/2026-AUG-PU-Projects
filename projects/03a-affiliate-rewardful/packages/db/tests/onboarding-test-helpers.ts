import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { fixturePools,migrateFixture } from './helpers';
import { bootstrapPilotOwner,type BootstrapInput } from '../../../scripts/bootstrap-pilot-owner';
import { OnboardingRepository } from '../src/onboarding-repository';
import { createOnboardingService } from '../../../apps/web/src/lib/onboarding/service';
import { hashGrantToken,hashIdentity } from '../../../apps/web/src/lib/onboarding/identity';
import { hashSessionToken } from '../../../apps/web/src/lib/auth/session';
import type { OnboardingService,ProgramInput,PolicyFields } from '../src/onboarding-contract';
export { fixturePools,migrateFixture };
export const passwordHash='$argon2id$v=19$m=65536,t=3,p=1$'+Buffer.alloc(16,1).toString('base64').replace(/=+$/,'')+'$'+Buffer.alloc(32,2).toString('base64').replace(/=+$/,'');
export const evidence={identity:{reference:'fixture:identity-reviewed',sha256:'a'.repeat(64)},authority:{reference:'fixture:n1-owner-reviewed',sha256:'b'.repeat(64)}};
export const policy:PolicyFields={rate_bp:1700,attribution_days:30,conflict_rule:'explicit_promo_else_last_valid_cookie',recurring_mode:'every_eligible_payment',commission_duration:'lifetime',currency:'RUB',timezone:'Europe/Moscow',terms_text:'Explicit fixture terms. Registration earns no commission.'};
export function newContext(pools:ReturnType<typeof fixturePools>){
 const identitySecret=randomBytes(32),sessionSecret=randomBytes(32),repository=new OnboardingRepository(pools.app);
 const service=createOnboardingService({repository,passwords:{hashPassword:async()=>passwordHash},identitySecret,sessionSecret});
 return {pools,identitySecret,sessionSecret,repository,service};
}
export type Context=ReturnType<typeof newContext>;
export async function resetOnboarding(pool:pg.Pool){
 const users=await pool.query<{id:string}>('SELECT DISTINCT enrolled_user_id AS id FROM n3a.enrollment_grants WHERE enrolled_user_id IS NOT NULL');
 await pool.query('TRUNCATE n3a.audit_events,n3a.eligibility_facts,n3a.partner_assets,n3a.invitations,n3a.memberships,n3a.bootstrap_receipts,n3a.enrollment_grants,n3a.partners,n3a.policy_versions,n3a.programs CASCADE');
 const ids=users.rows.map(r=>r.id);await pool.query('DELETE FROM n3a.sessions WHERE user_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM n3a.users WHERE id=ANY($1::uuid[])',[ids]);
}
export async function bootstrap(ctx:Context,overrides:Partial<BootstrapInput>={}){
 const directory=await mkdtemp(path.join(tmpdir(),'n3a-onboarding-private-'));
 const input={mode:'create',request_id:randomUUID(),identity:'Owner@pilot.example',external_actor_ref:'fixture:offline-operator',evidence,expires_at:new Date(Date.now()+3600000).toISOString(),name:'Fixture N1 pilot',public_slug:'pilot-fixture',...overrides};
 const outputPath=path.join(directory,'grant.json');
 const result=await bootstrapPilotOwner({pool:ctx.pools.migrate,input,identitySecret:ctx.identitySecret,outputPath});
 const output:unknown=JSON.parse(await readFile(outputPath,'utf8'));
 if(!output||typeof output!=='object'||!('grant_token'in output)||typeof output.grant_token!=='string')throw new Error('fixture_handoff_invalid');
 return {...result,grant_token:output.grant_token,input,outputPath};
}
export async function register(ctx:Context,identity:string,grant_token:string){
 const result=await ctx.service.register({identity,password:'synthetic-password-123',grant_token});
 return {...result,sessionTokenHash:hashSessionToken(result.token,ctx.sessionSecret),identityHash:hashIdentity(identity,ctx.identitySecret)};
}
export async function owner(ctx:Context){
 const b=await bootstrap(ctx);const account=await register(ctx,'owner@pilot.example',b.grant_token);
 const accepted=await ctx.service.acceptEnrollment({sessionTokenHash:account.sessionTokenHash,grant_token:b.grant_token});
 return {...b,...account,...accepted};
}
export async function save(ctx:Context,o:ProgramInput){return ctx.service.savePolicy({...o,...policy,expected_version:0,effective_mode:'now',acknowledged:true});}
export async function partner(ctx:Context,o:ProgramInput,email='partner@pilot.example'){
 const issued=await ctx.service.issueEnrollment({...o,identity:email,role:'partner',evidence,expires_at:new Date(Date.now()+3600000).toISOString()});
 const account=await register(ctx,email,issued.grant_token);
 const preview=await ctx.service.previewEnrollment({sessionTokenHash:account.sessionTokenHash,grant_token:issued.grant_token});
 if(!preview.policy)throw new Error('fixture_policy_missing');
 const acceptance={sessionTokenHash:account.sessionTokenHash,grant_token:issued.grant_token,policy_id:preview.policy.id,terms_hash:preview.policy.terms_hash,accepted:true as const};
 return {...issued,...account,acceptance};
}
export async function count(pool:pg.Pool,table:string){
 if(!['users','sessions','programs','memberships','partners','partner_assets','eligibility_facts','audit_events','enrollment_grants','bootstrap_receipts','invitations','admission_buckets'].includes(table))throw new Error('invalid_fixture_table');
 return Number((await pool.query<{n:string}>(`SELECT count(*) AS n FROM n3a.${table}`)).rows[0]!.n);
}
export async function waitForLock(pool:pg.Pool,applicationName:string){
 const until=Date.now()+3000;
 while(Date.now()<until){const r=await pool.query('SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\'',[applicationName]);if(r.rowCount)return;await new Promise(r=>setTimeout(r,10));}
 throw new Error('expected_lock_wait_missing');
}
