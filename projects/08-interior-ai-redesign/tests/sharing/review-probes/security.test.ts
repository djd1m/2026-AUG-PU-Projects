import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {it,expect,beforeEach,afterEach} from 'vitest';
import {AuthService} from '@n8/domain/identity';
import {passwords,tokenPort} from '@n8/adapters/auth';
import {PgAuthStore,PgProjects,PgRateGate} from '@n8/db/identity';
import {normalizeExport} from '../../../packages/adapters/src/image-exporter.js';
import {createSharingHandlers} from '../../../apps/web/src/server/sharing.js';
import {createSpaceHandlers} from '../../../apps/web/src/server/space.js';
import {loadConfig} from '../../../apps/web/src/server/config.js';
import type {Base} from '../../../apps/web/src/server/composition.js';
import {freshDb} from '../../helpers/db.js';
import {fixture,exported,publication} from '../fixtures.js';

let db:Awaited<ReturnType<typeof freshDb>>,dir:string;
beforeEach(async()=>{db=await freshDb();dir=await mkdtemp(join(tmpdir(),'n8-independent-review-'));});
afterEach(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});

it('independent SQL: every ready-export field stays frozen, including kind relabel, IDs, timestamps and keys',async()=>{
 const f=await fixture(db.pool),asset=await exported(f);
 const changes=["kind='reference'","id=gen_random_uuid()","created_at=created_at-interval '1 second'","mime='image/webp'","original_key=gen_random_uuid()::text","normalized_key=gen_random_uuid()::text","bytes=101","stored_bytes=101","original_hash=repeat('b',64)","rights_confirmed=false","metadata=metadata || '{\"watermarked\":false}'::jsonb","state='pending'"];
 for(const change of changes)await expect(db.pool.query(`UPDATE asset SET ${change} WHERE id=$1`,[asset.id])).rejects.toThrow('immutable export provenance');
 const row=await f.repo.assertExportAccess(f.actor,asset.id);
 expect(row.kind).toBe('share_image');expect(row.metadata).toMatchObject({watermarked:true});
});

it('independent SQL: share identity and TTL frozen; revocation cannot be cleared, moved or bypassed',async()=>{
 const f=await fixture(db.pool),asset=await exported(f);
 const link=await f.repo.publish(f.actor,f.project,f.version,publication(f.designId,asset.id),randomUUID());
 for(const change of ["expires_at=expires_at+interval '1 day'","created_at=created_at-interval '1 day'","caption='replacement'","token_hash=repeat('b',64)","id=gen_random_uuid()"]){
  await expect(db.pool.query(`UPDATE share_link SET ${change} WHERE id=$1`,[link.share.id])).rejects.toThrow('immutable share identity');
 }
 await f.repo.revoke(f.actor,f.project,link.version,link.share.id);
 for(const change of ["revoked_at=NULL","revoked_at=revoked_at+interval '1 second'"]){
  await expect(db.pool.query(`UPDATE share_link SET ${change} WHERE id=$1`,[link.share.id])).rejects.toThrow('immutable share identity');
 }
 await expect(f.repo.resolve(link.share.url.split('/').pop()!)).rejects.toMatchObject({status:404});
});

it('independent capacity boundary: 63 pending assets allow exactly one simultaneous export reservation',async()=>{
 const f=await fixture(db.pool);
 for(let i=0;i<63;i++)await db.pool.query("INSERT INTO asset(project_id,kind,original_key,mime,rights_confirmed,stored_bytes) VALUES($1,'reference',$2,'image/png',true,1)",[f.project,randomUUID()]);
 const attempts=await Promise.allSettled(Array.from({length:12},()=>f.repo.reserveExport(f.actor,f.project,f.version,f.designId)));
 expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect(attempts.filter(x=>x.status==='rejected'&&x.reason.code==='ASSET_QUOTA')).toHaveLength(11);
 expect((await db.pool.query('SELECT count(*)::int n FROM asset')).rows[0].n).toBe(64);
});

async function httpFixture(){
 const f=await fixture(db.pool),secret='r'.repeat(32),tokens=tokenPort(secret),token=tokens.create();
 await db.pool.query("INSERT INTO session(account_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[f.actor,tokens.hash(token)]);
 const base:Base={pool:db.pool,config:loadConfig({DATABASE_URL:'postgresql://localhost/test',N8_PUBLIC_ORIGIN:'https://n8.test',N8_SESSION_SECRET:secret,N8_ASSET_DIR:dir}),auth:new AuthService(new PgAuthStore(db.pool),passwords,tokens,{now:()=>new Date()}),projects:new PgProjects(db.pool),rate:new PgRateGate(db.pool),hashSubject:value=>tokens.hash(value)};
 const req=(path:string)=>new Request('https://n8.test'+path,{headers:{cookie:`n8_session=${token}`,'x-n8-peer':'192.0.2.123'}});
 return {f,base,req};
}

it('independent generic asset route denies free and paid frozen export through original and normalized paths',async()=>{
 const {f,base,req}=await httpFixture(),space=createSpaceHandlers(base);
 for(const paid of [false,true]){
  await db.pool.query('UPDATE account SET paid_export=$1 WHERE id=$2',[paid,f.actor]);const asset=await exported(f);
  for(const suffix of ['', '?original=1'])expect((await space.asset(req(`/api/assets/${asset.id}${suffix}`),asset.id)).status).toBe(404);
 }
});

it('independent archive and unknown tokens return404/no-store/noindex on both public surfaces',async()=>{
 const {f,base,req}=await httpFixture(),handlers=createSharingHandlers(base),asset=await exported(f);
 const link=await f.repo.publish(f.actor,f.project,f.version,publication(f.designId,asset.id),randomUUID());
 await db.pool.query("UPDATE project SET state='archived' WHERE id=$1",[f.project]);
 for(const token of [link.share.url.split('/').pop()!,'a'.repeat(43),'bad']){
  for(const method of [handlers.publicPage,handlers.publicImage]){
   const response=await method(req('/s/'+token),token);expect(response.status).toBe(404);
   expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');
   const body=await response.text();for(const id of [f.actor,f.project,f.designId,asset.id])expect(body).not.toContain(id);
  }
 }
});

it('independent expired active-project token returns404/no-store/noindex on page and image',async()=>{
 const {f,base,req}=await httpFixture(),handlers=createSharingHandlers(base),asset=await exported(f),token=randomBytes(32).toString('base64url');
 await db.pool.query("INSERT INTO share_link(project_id,design_id,asset_id,token_hash,caption,expires_at) VALUES($1,$2,$3,$4,'expired',now()-interval '1 second')",[f.project,f.designId,asset.id,createHash('sha256').update(token).digest('hex')]);
 for(const method of [handlers.publicPage,handlers.publicImage]){
  const response=await method(req('/s/'+token),token);expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');
 }
});

it('independent pagination correction: fifty plus one HTTP pages preserve all own rows and reject foreign cursors',async()=>{
 const {f,base,req}=await httpFixture(),handlers=createSharingHandlers(base),expectedExports:string[]=[],expectedShares:string[]=[];
 for(let i=0;i<51;i++){
  const asset=await exported(f);expectedExports.push(asset.id);
  const share=await f.repo.publish(f.actor,f.project,f.version,publication(f.designId,asset.id),randomUUID());f.version=share.version;expectedShares.push(share.share.id);
 }
 const other=await fixture(db.pool),foreignAsset=await exported(other);
 const foreignShare=await other.repo.publish(other.actor,other.project,other.version,publication(other.designId,foreignAsset.id),randomUUID());
 for(const [name,handler,expected,foreignCursor] of [
  ['exports',handlers.exports,expectedExports,foreignAsset.id],['shares',handlers.shares,expectedShares,foreignShare.share.id],
 ] as const){
  const first=await handler(req(`/api/projects/${f.project}/${name}`),f.project);expect(first.status).toBe(200);const page1=(await first.json()).data;
  expect(page1.items).toHaveLength(50);expect(page1.nextCursor).toBe(page1.items[49].id);
  const second=await handler(req(`/api/projects/${f.project}/${name}?after=${page1.nextCursor}`),f.project);expect(second.status).toBe(200);const page2=(await second.json()).data;
  expect(page2.items).toHaveLength(1);expect(page2.nextCursor).toBeNull();
  expect([...page1.items,...page2.items].map((x:{id:string})=>x.id).sort()).toEqual([...expected].sort());
  if(name==='shares')for(const row of [...page1.items,...page2.items]){expect(row).not.toHaveProperty('url');expect(row).not.toHaveProperty('token_hash');}
  expect((await handler(req(`/api/projects/${f.project}/${name}?after=${foreignCursor}`),f.project)).status).toBe(404);
  expect((await handler(req(`/api/projects/${f.project}/${name}?after=${randomUUID()}`),f.project)).status).toBe(404);
 }
});

it('independent actual child deadline kills stalled decode and releases slot for next valid image',async()=>{
 const fifo=join(dir,'stalled-input');expect(spawnSync('mkfifo',[fifo]).status).toBe(0);
 const start=performance.now();await expect(normalizeExport(fifo,join(dir,randomUUID()),true)).rejects.toMatchObject({code:'EXPORT_TIMEOUT'});
 expect(performance.now()-start).toBeGreaterThanOrEqual(9900);expect(performance.now()-start).toBeLessThan(13000);
 const input=join(dir,randomUUID());await writeFile(input,await sharp({create:{width:640,height:320,channels:3,background:'white'}}).png().toBuffer());
 const result=await normalizeExport(input,join(dir,randomUUID()),true);expect(result.width).toBe(640);expect(result.height).toBe(320);
});
