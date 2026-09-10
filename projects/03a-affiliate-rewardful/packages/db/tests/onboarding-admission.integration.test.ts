import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { fixturePools,migrateFixture,count } from './onboarding-test-helpers';
import { AdmissionRepository } from '../src/admission-repository';
const pools=fixturePools();const a=new AdmissionRepository(pools.app),b=new AdmissionRepository(pools.app);
beforeAll(migrateFixture);beforeEach(async()=>{await pools.migrate.query('UPDATE n3a.admission_buckets SET count=0,window_start=clock_timestamp()');});afterAll(async()=>{await pools.app.end();await pools.migrate.end();});
it('fixed8193 shared rows atomically admit 60 source requests, without charging global on rejection',async()=>{
 const results=await Promise.all(Array.from({length:90},(_,i)=>(i%2?a:b).chargeSource(12)));expect(results.filter(x=>x.allowed)).toHaveLength(60);expect(results.filter(x=>!x.allowed).every(x=>x.retry_after>=1)).toBe(true);
 expect((await pools.migrate.query("SELECT count FROM n3a.admission_buckets WHERE kind='global'")).rows[0].count).toBe(60);expect(await count(pools.migrate,'admission_buckets')).toBe(8193);
 expect((await new AdmissionRepository(pools.app).chargeSource(12)).allowed).toBe(false);
});
it('global300 and identity10 limits persist independently across repository instances and reset in place',async()=>{
 const global=await Promise.all(Array.from({length:330},(_,i)=>a.chargeSource(i%10)));expect(global.filter(x=>x.allowed)).toHaveLength(300);
 const identity=await Promise.all(Array.from({length:22},(_,i)=>(i%2?a:b).chargeIdentity(13)));expect(identity.filter(x=>x.allowed)).toHaveLength(10);
 await pools.migrate.query("UPDATE n3a.admission_buckets SET window_start=clock_timestamp()-interval '16 minutes' WHERE kind='identity' AND slot=13");expect((await a.chargeIdentity(13)).allowed).toBe(true);expect(await count(pools.migrate,'admission_buckets')).toBe(8193);
 await expect(a.chargeSource(4096)).rejects.toMatchObject({code:'invalid_input'});
});
