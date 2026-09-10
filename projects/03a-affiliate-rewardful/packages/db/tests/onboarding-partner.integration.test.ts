import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { fixturePools,migrateFixture,newContext,resetOnboarding,owner,save,partner,count } from './onboarding-test-helpers';
const pools=fixturePools(),ctx=newContext(pools);
beforeAll(migrateFixture);beforeEach(()=>resetOnboarding(pools.migrate));afterAll(async()=>{await resetOnboarding(pools.migrate);await pools.app.end();await pools.migrate.end();});
it('concurrent consent creates one membership, one link/promo and immutable consent/facts; injected final failure rolls everything back',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);
 await pools.migrate.query("CREATE FUNCTION n3a.fixture_fail_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='accept' AND EXISTS(SELECT 1 FROM n3a.enrollment_grants WHERE id=NEW.target_id AND role='partner') THEN RAISE EXCEPTION 'fixture_failure'; END IF;RETURN NEW;END $$");
 await pools.migrate.query('CREATE TRIGGER fixture_fail_accept BEFORE INSERT ON n3a.audit_events FOR EACH ROW EXECUTE FUNCTION n3a.fixture_fail_accept()');
 const before=await count(pools.migrate,'eligibility_facts');
 try{await expect(ctx.service.acceptPartner(p.acceptance)).rejects.toMatchObject({code:'unavailable'});expect(await count(pools.migrate,'partner_assets')).toBe(0);expect(await count(pools.migrate,'memberships')).toBe(1);expect(await count(pools.migrate,'eligibility_facts')).toBe(before);
 expect((await pools.migrate.query('SELECT status,accepted_at FROM n3a.partners WHERE id=$1',[p.partner_id])).rows[0]).toEqual({status:'invited',accepted_at:null});}
 finally{await pools.migrate.query('DROP TRIGGER fixture_fail_accept ON n3a.audit_events');await pools.migrate.query('DROP FUNCTION n3a.fixture_fail_accept()');}
 const results=await Promise.all([ctx.service.acceptPartner(p.acceptance),ctx.service.acceptPartner(p.acceptance)]);expect(results[0]).toEqual(results[1]);expect(results[0].assets.map(a=>a.kind).sort()).toEqual(['link','promo']);
 expect(await count(pools.migrate,'memberships')).toBe(2);expect(await count(pools.migrate,'partner_assets')).toBe(2);expect(await count(pools.migrate,'eligibility_facts')).toBe(before+3);
 await expect(pools.migrate.query('UPDATE n3a.partners SET accepted_at=accepted_at+interval \'1 second\' WHERE id=$1',[p.partner_id])).rejects.toMatchObject({code:'23514'});
});
it('suspension denies portal/replay, reactivation restores read only and preserves separately revoked asset/history',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);const accepted=await ctx.service.acceptPartner(p.acceptance);const link=accepted.assets.find(x=>x.kind==='link')!;
 const afterAccept=(await pools.migrate.query<{t:Date}>('SELECT clock_timestamp() AS t')).rows[0]!.t.toISOString();
 const history={...o,partner_id:accepted.partner_id,asset_id:link.id};expect((await ctx.service.resolveEligibility({...history,at:afterAccept})).state).toBe('eligible');
 await ctx.service.revokeAsset({...o,asset_id:link.id});await ctx.service.setPartnerStatus({...o,partner_id:accepted.partner_id,status:'suspended',expected_status:'active'});
 await expect(ctx.service.getPartnerAssets({sessionTokenHash:p.sessionTokenHash,program_id:o.program_id})).rejects.toMatchObject({code:'enrollment_unavailable'});
 await expect(ctx.service.acceptPartner(p.acceptance)).rejects.toMatchObject({code:'enrollment_unavailable'});
 const facts=await count(pools.migrate,'eligibility_facts');await ctx.service.setPartnerStatus({...o,partner_id:accepted.partner_id,status:'suspended',expected_status:'active'});expect(await count(pools.migrate,'eligibility_facts')).toBe(facts);
 await ctx.service.setPartnerStatus({...o,partner_id:accepted.partner_id,status:'active',expected_status:'suspended'});
 const restored=await ctx.service.getPartnerAssets({sessionTokenHash:p.sessionTokenHash,program_id:o.program_id});expect(restored.accepted_at).toBe(accepted.accepted_at);expect(restored.assets.find(x=>x.id===link.id)?.status).toBe('revoked');
 expect((await ctx.service.getProgram({...p,program_id:o.program_id})).scopes).toEqual(['read']);expect((await ctx.service.resolveEligibility({...history,at:new Date().toISOString()})).state).toBe('ineligible');expect((await ctx.service.resolveEligibility({...history,at:afterAccept})).state).toBe('eligible');
 expect((await ctx.service.resolveEligibility({...history,at:'2000-01-01T00:00:00Z'})).state).toBe('ineligible');
 await pools.migrate.query('DELETE FROM n3a.eligibility_facts WHERE asset_id=$1',[link.id]);
 expect((await ctx.service.resolveEligibility({...history,at:new Date().toISOString()})).state).toBe('unknown');
});
it('future latest fact causes rollback rather than backdating a transition',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);const a=await ctx.service.acceptPartner(p.acceptance);
 await pools.migrate.query("UPDATE n3a.eligibility_facts SET valid_from=clock_timestamp()+interval '1 hour' WHERE subject_kind='partner' AND subject_id=$1 AND version=2",[a.partner_id]);
 const before=await count(pools.migrate,'eligibility_facts');await expect(ctx.service.setPartnerStatus({...o,partner_id:a.partner_id,status:'suspended',expected_status:'active'})).rejects.toMatchObject({code:'unavailable'});
 expect(await count(pools.migrate,'eligibility_facts')).toBe(before);expect((await ctx.service.getPartnerAssets({sessionTokenHash:p.sessionTokenHash,program_id:o.program_id})).partner_status).toBe('active');
});
it('foreign partner/program object IDs are denied and scoped DTOs reveal no secrets',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);await ctx.service.acceptPartner(p.acceptance);const q=await partner(ctx,o,'second@pilot.example');const qa=await ctx.service.acceptPartner(q.acceptance);
 await expect(ctx.service.getPartnerAssets({...p,program_id:o.program_id,partner_id:qa.partner_id})).rejects.toMatchObject({code:'enrollment_unavailable'});
 await expect(ctx.service.getProgram({...p,program_id:randomUUID()})).rejects.toMatchObject({code:'enrollment_unavailable'});
 await expect(ctx.service.getProgram({...o,sessionTokenHash:randomBytes(32)})).rejects.toMatchObject({code:'unauthorized'});
 const text=JSON.stringify(await ctx.service.listMembers(o));expect(text).not.toMatch(/identity_hash|token_hash|grant_token|password|evidence/);
 const first=await ctx.service.listMembers({...o,limit:1});expect(first.members.items).toHaveLength(1);expect(first.members.next_cursor).not.toBeNull();
 const second=await ctx.service.listMembers({...o,limit:1,member_cursor:first.members.next_cursor!});expect(second.members.items[0]?.id).not.toBe(first.members.items[0]?.id);
});
it('every coupled acceptance write rolls back and leaves the invitation usable',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);
 const tables=['partners','memberships','eligibility_facts','partner_assets','enrollment_grants','invitations','audit_events'] as const;
 const counts=await Promise.all(tables.map(table=>count(pools.migrate,table)));
 const boundaries=tables.map(table=>({table,predicate:'true'}));
 boundaries.push({table:'partner_assets',predicate:"NEW.kind='promo'"},
 ...['link','promo'].map(kind=>({table:'eligibility_facts' as const,predicate:`NEW.subject_kind='asset' AND EXISTS(SELECT 1 FROM n3a.partner_assets WHERE id=NEW.asset_id AND kind='${kind}')`})));
 for(const {table,predicate} of boundaries){
 await pools.migrate.query(`CREATE FUNCTION n3a.fixture_accept_boundary() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${predicate} THEN RAISE EXCEPTION 'fixture_boundary';END IF;RETURN NEW;END $$`);
 await pools.migrate.query(`CREATE TRIGGER fixture_accept_boundary AFTER INSERT OR UPDATE ON n3a.${table} FOR EACH ROW EXECUTE FUNCTION n3a.fixture_accept_boundary()`);
 try{await expect(ctx.service.acceptPartner(p.acceptance)).rejects.toMatchObject({code:'unavailable'});
 expect(await Promise.all(tables.map(t=>count(pools.migrate,t)))).toEqual(counts);
 expect((await pools.migrate.query('SELECT status,accepted_at,accepted_policy_id FROM n3a.partners WHERE id=$1',[p.partner_id])).rows[0]).toEqual({status:'invited',accepted_at:null,accepted_policy_id:null});
 expect((await pools.migrate.query('SELECT consumed_at FROM n3a.enrollment_grants WHERE id=$1',[p.grant_id])).rows[0].consumed_at).toBeNull();
 expect((await pools.migrate.query('SELECT consumed_at FROM n3a.invitations WHERE enrollment_grant_id=$1',[p.grant_id])).rows[0].consumed_at).toBeNull();
 }finally{await pools.migrate.query(`DROP TRIGGER fixture_accept_boundary ON n3a.${table}`);await pools.migrate.query('DROP FUNCTION n3a.fixture_accept_boundary()');}
 }
 await expect(ctx.service.acceptPartner({...p.acceptance,terms_hash:'f'.repeat(64)})).rejects.toMatchObject({code:'terms_changed'});
 const accepted=await ctx.service.acceptPartner(p.acceptance);expect(accepted.assets).toHaveLength(2);
});
it('existing identity adds a second program membership only after binding and consent; old credentials and membership survive',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);const first=await ctx.service.acceptPartner(p.acceptance);
 const foreign=randomUUID(),tenant=randomUUID(),grant=randomUUID();
 await pools.migrate.query("INSERT INTO n3a.programs(id,tenant_id,owner_id,name,public_slug) VALUES($1,$2,$3,'Other pilot fixture','second-program-fixture')",[foreign,tenant,o.user_id]);
 await pools.migrate.query('INSERT INTO n3a.enrollment_grants(id,tenant_id,program_id,created_at,invited_identity_hash,token_hash,role,scopes,expires_at,consumed_at,enrolled_user_id,issuer_kind,external_actor_ref,identity_evidence,authority_evidence) SELECT $1,$2,$3,created_at,invited_identity_hash,$4,role,scopes,expires_at,consumed_at,enrolled_user_id,issuer_kind,external_actor_ref,identity_evidence,authority_evidence FROM n3a.enrollment_grants WHERE id=$5',[grant,tenant,foreign,randomBytes(32),o.grant_id]);
 await pools.migrate.query('INSERT INTO n3a.memberships(tenant_id,program_id,user_id,created_at,role,scopes,source_grant_id,status) SELECT $1,$2,user_id,created_at,role,scopes,$3,status FROM n3a.memberships WHERE id=$4',[tenant,foreign,grant,o.membership_id]);
 const other={...o,program_id:foreign};await save(ctx,other);
 const beforeUsers=await count(pools.migrate,'users'),beforeSessions=await count(pools.migrate,'sessions');
 const issued=await ctx.service.issueEnrollment({...other,role:'partner',identity:'partner@pilot.example',evidence:(await import('./onboarding-test-helpers')).evidence,expires_at:new Date(Date.now()+3600000).toISOString()});
 await expect(ctx.service.previewEnrollment({...p,grant_token:issued.grant_token})).rejects.toMatchObject({code:'enrollment_unavailable'});
 const bound=await ctx.service.bindEnrollment({...p,grant_token:issued.grant_token});
 await expect(ctx.service.getPartnerAssets({sessionTokenHash:p.sessionTokenHash,program_id:foreign})).rejects.toMatchObject({code:'enrollment_unavailable'});
 const second=await ctx.service.acceptPartner({...p,grant_token:issued.grant_token,policy_id:bound.policy!.id,terms_hash:bound.policy!.terms_hash,accepted:true});
 expect(second.program_id).toBe(foreign);expect(second.partner_id).not.toBe(first.partner_id);
 expect((await ctx.service.getMe(p)).memberships.items.filter(m=>m.role==='partner')).toHaveLength(2);
 expect(await count(pools.migrate,'users')).toBe(beforeUsers);expect(await count(pools.migrate,'sessions')).toBe(beforeSessions);
 expect((await ctx.service.getPartnerAssets({sessionTokenHash:p.sessionTokenHash,program_id:o.program_id})).partner_id).toBe(first.partner_id);
});

it('eligibility evidence resolves to each fact and hashes its exact versioned server event',async()=>{
 const o=await owner(ctx);await save(ctx,o);const p=await partner(ctx,o);const accepted=await ctx.service.acceptPartner(p.acceptance);
 await ctx.service.revokeAsset({...o,asset_id:accepted.assets[0]!.id});
 const {rows}=await pools.migrate.query(`SELECT *,
 to_char(valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_text,
 to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expiry_text
 FROM n3a.eligibility_facts ORDER BY id`);
 expect(rows.length).toBeGreaterThanOrEqual(5);
 for(const f of rows){
 const values=['n3a:eligibility:v1',f.id,f.tenant_id,f.program_id,f.subject_kind,f.subject_id,f.version,f.valid_text,f.status,f.expiry_text,f.consent_policy_id,f.actor_id];
 const payload='['+values.map(value=>JSON.stringify(value)).join(', ')+']';
 expect(f.evidence.reference).toBe('server:eligibility:v1:'+f.id);
 expect(f.evidence.sha256).toBe(createHash('sha256').update(payload).digest('hex'));
 }
});
it('invalid sessions cannot distinguish existing and missing program objects or grants',async()=>{
 const o=await owner(ctx);const sessionTokenHash=randomBytes(32);
 for(const program_id of [o.program_id,randomUUID()]){
 for(const operation of [()=>ctx.service.getProgram({sessionTokenHash,program_id}),()=>ctx.service.listMembers({sessionTokenHash,program_id}),()=>ctx.service.getPartnerAssets({sessionTokenHash,program_id})])
 await expect(operation()).rejects.toMatchObject({code:'unauthorized'});
 }
 for(const grant_token of [o.grant_token,randomBytes(32).toString('base64url')])
 await expect(ctx.service.previewEnrollment({sessionTokenHash,grant_token})).rejects.toMatchObject({code:'unauthorized'});
});
