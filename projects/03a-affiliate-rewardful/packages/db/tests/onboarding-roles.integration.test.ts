import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { randomBytes,randomUUID } from 'node:crypto';
import { fixturePools,migrateFixture,newContext,resetOnboarding,owner,save,partner,evidence } from './onboarding-test-helpers';
const pools=fixturePools(),ctx=newContext(pools);
beforeAll(migrateFixture);beforeEach(()=>resetOnboarding(pools.migrate));afterAll(async()=>{await resetOnboarding(pools.migrate);await pools.app.end();await pools.migrate.end();});
it('actual app has no table reads/DML or internal/bootstrap functions; all published functions fixed search path and PUBLIC denied',async()=>{
 const tables=['programs','policy_versions','partners','enrollment_grants','bootstrap_receipts','memberships','invitations','partner_assets','eligibility_facts','audit_events','admission_buckets'];
 for(const table of tables){for(const operation of ['SELECT','INSERT','UPDATE','DELETE']){
 const result=await pools.migrate.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['n3a_app','n3a.'+table,operation]);expect(result.rows[0].allowed,table+':'+operation).toBe(false);
 }}
 const funcs=await pools.migrate.query("SELECT p.proname,p.proconfig,p.prosecdef,has_function_privilege('n3a_app',p.oid,'EXECUTE') AS app,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='n3a' AND (p.proname LIKE 'onboarding_%' OR p.proname LIKE 'bootstrap_%')");
 for(const fn of funcs.rows){expect(fn.public,fn.proname).toBe(false);expect(fn.proconfig).toContain('search_path=pg_catalog, pg_temp');if(fn.app)expect(fn.prosecdef).toBe(true);if(fn.proname.startsWith('bootstrap_'))expect(fn.app).toBe(false);}
 await expect(pools.app.query("SELECT n3a.lock_program($1)",[randomUUID()])).rejects.toMatchObject({code:'42501'});
});
it('SQL itself rejects forbidden scopes and cross-program asset/policy/partner relations; hostile search path cannot redirect objects',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);const accepted=await ctx.service.acceptPartner(p.acceptance);
 const tenant=randomUUID(),foreign=randomUUID();await pools.migrate.query("INSERT INTO n3a.programs(id,tenant_id,name,public_slug) VALUES($1,$2,'Foreign','foreign-fixture')",[foreign,tenant]);
 await expect(pools.migrate.query("UPDATE n3a.partner_assets SET program_id=$1,tenant_id=$2 WHERE id=$3",[foreign,tenant,accepted.assets[0]!.id])).rejects.toMatchObject({code:'23503'});
 await expect(pools.migrate.query("UPDATE n3a.memberships SET scopes=ARRAY['read','configure'] WHERE partner_id=$1",[accepted.partner_id])).rejects.toMatchObject({code:'23514'});
 await expect(pools.app.query('SELECT n3a.onboarding_issue($1,$2,$3,$4,$5)',[o.sessionTokenHash,o.program_id,JSON.stringify({role:'operator',scopes:['configure'],expires_at:new Date(Date.now()+10000).toISOString(),evidence}),randomBytes(32),randomBytes(32)])).rejects.toMatchObject({message:'invalid_input'});
 await expect(pools.app.query('CREATE TEMP TABLE programs(id uuid)')).rejects.toMatchObject({code:'42501'});
 await pools.migrate.query('CREATE SCHEMA fixture_hostile');await pools.migrate.query('CREATE TABLE fixture_hostile.programs(id uuid,name text)');
 await pools.migrate.query("INSERT INTO fixture_hostile.programs VALUES($1,'attacker')",[o.program_id]);
 await pools.migrate.query('GRANT USAGE ON SCHEMA fixture_hostile TO n3a_app; GRANT SELECT ON fixture_hostile.programs TO n3a_app');
 const client=await pools.app.connect();try{await client.query('BEGIN');await client.query('SET LOCAL search_path=fixture_hostile,pg_temp,public');
 const result=await client.query('SELECT n3a.onboarding_program($1,$2) AS result',[o.sessionTokenHash,o.program_id]);expect(result.rows[0].result.name).toBe('Fixture N1 pilot');await client.query('ROLLBACK');}finally{await client.query('ROLLBACK');client.release();await pools.migrate.query('DROP SCHEMA fixture_hostile CASCADE');}
});
