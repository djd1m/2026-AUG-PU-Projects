import {beforeEach,afterEach,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {PgDesigns,PgJobs} from '@n8/db/design';
import {PgProcurement} from '@n8/db/procurement';
import {productBody} from '../procurement/db-fixture';
import {freshDb} from '../helpers/db';
import {setup,revision,clock} from './fixtures';
let db:Awaited<ReturnType<typeof freshDb>>;beforeEach(async()=>{db=await freshDb();});afterEach(async()=>{await db.close();});
it('ownership, concurrent CAS, immutable approval and restore new draft',async()=>{const f=await setup(db.pool),d=new PgDesigns(db.pool);await expect(d.create(randomUUID(),f.project,1,revision(f.scene))).rejects.toMatchObject({code:'NOT_FOUND'});const results=await Promise.allSettled([d.create(f.actor,f.project,1,revision(f.scene)),d.create(f.actor,f.project,1,revision(f.scene))]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const current=(await d.list(f.actor,f.project)).items[0]!;await d.approve(f.actor,f.project,2,current.id);const restored=await d.restore(f.actor,f.project,3,current.id);expect(restored.design.state).toBe('draft');expect(restored.design.approvedAt).toBeNull();expect(restored.design.parentId).toBe(current.id);expect((await d.get(f.actor,f.project,current.id)).state).toBe('superseded');await expect(db.pool.query("UPDATE design_revision SET style='illegal' WHERE id=$1",[current.id])).rejects.toThrow('immutable');});
it('catalog server UUID, exact immutable dimensions and same-project snapshot guard',async()=>{const f=await setup(db.pool),d=new PgDesigns(db.pool);const c=await d.registerCatalog(f.actor,f.project,1,{name:'Стол',primitive:'box',dimensionsM:['2','1','1']});expect(c.item.source).toBe('manual');expect(c.item.id).toMatch(/^[a-f0-9-]{36}$/);await expect(d.registerCatalog(f.actor,f.project,2,{name:'Стол',primitive:'box',dimensionsM:['1','1','1'],snapshotId:randomUUID()})).rejects.toMatchObject({status:404,code:'NOT_FOUND'});await expect(db.pool.query("UPDATE project SET scene_catalog='[]' WHERE id=$1",[f.project])).rejects.toThrow('immutable');});
it('combined 100 revision capacity under competing connections',async()=>{const f=await setup(db.pool),d=new PgDesigns(db.pool);await db.pool.query(`INSERT INTO design_revision(project_id,shell_id,shell_hash,scene,style,mode,fit,change_reason) SELECT $1,$2,$3,$4,'x','manual','bbox_checked','seed' FROM generate_series(1,98)`,[f.project,f.shell.id,f.shell.hash,f.scene]);const r=await Promise.allSettled([d.create(f.actor,f.project,1,revision(f.scene)),d.create(f.actor,f.project,1,revision(f.scene))]);expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1);await expect(d.create(f.actor,f.project,2,revision(f.scene))).rejects.toMatchObject({code:'REVISION_LIMIT'});});
it('history pagination does not drop equal timestamps',async()=>{const f=await setup(db.pool),d=new PgDesigns(db.pool);await db.pool.query(`INSERT INTO design_revision(project_id,shell_id,shell_hash,scene,style,mode,fit,change_reason,created_at) SELECT $1,$2,$3,$4,'x','manual','bbox_checked','seed','2026-01-01' FROM generate_series(1,75)`,[f.project,f.shell.id,f.shell.hash,f.scene]);const first=await d.list(f.actor,f.project),second=await d.list(f.actor,f.project,first.nextCursor!);expect(first.items).toHaveLength(50);expect(second.items).toHaveLength(25);expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(75);});
it('FND-FINAL-1 foreign and absent array scalar JSON design relation IDs return identical404 without side effects',async()=>{
 const a=await setup(db.pool),b=await setup(db.pool),designs=new PgDesigns(db.pool),foreignDesign=(await designs.create(b.actor,b.project,1,revision(b.scene))).design;
 const foreignReference=randomUUID();await db.pool.query("INSERT INTO reference(id,project_id,source_url,observed_at,rights_confirmed) VALUES($1,$2,'https://example.org/ref',now(),true)",[foreignReference,b.project]);
 const foreignProduct=(await new PgProcurement(db.pool).createProduct(b.actor,b.project,2,productBody())).product;
 const foreignCatalog=(await designs.registerCatalog(b.actor,b.project,3,{name:'Стул',primitive:'box',dimensionsM:['1','1','1']})).item;
 const jobs=new PgJobs(db.pool,{aiMode:'demo'},clock());
 for(const missing of [false,true]){
  const relation=(value:string)=>missing?randomUUID():value;
  const inputs=[{...revision(a.scene),referenceIds:[relation(foreignReference)]},{...revision(a.scene),parentId:relation(foreignDesign.id)},{...revision(a.scene),scene:{...a.scene,shellId:relation(b.shell.id)}},{...revision(a.scene),scene:{...a.scene,objects:[{id:randomUUID(),catalogId:relation(foreignCatalog.id),dimensionsM:['1','1','1'],positionM:[2,0,2],rotationY:0}]}}];
  for(const input of inputs)await expect(designs.create(a.actor,a.project,1,input)).rejects.toMatchObject({status:404,code:'NOT_FOUND'});
  await expect(designs.registerCatalog(a.actor,a.project,1,{name:'Стул',primitive:'box',dimensionsM:['1','1','1'],snapshotId:relation(foreignProduct.id)})).rejects.toMatchObject({status:404,code:'NOT_FOUND'});
  for(const input of [{...a.input,shellId:relation(b.shell.id)},{...a.input,referenceIds:[relation(foreignReference)]}]){
   await expect(jobs.preview(a.actor,a.project,1,input)).rejects.toMatchObject({status:404,code:'NOT_FOUND'});
   await expect(jobs.submit(a.actor,a.project,1,randomUUID(),input,'a'.repeat(64))).rejects.toMatchObject({status:404,code:'NOT_FOUND'});
  }
 }
 expect((await db.pool.query('SELECT version,current_design_id,scene_catalog FROM project WHERE id=$1',[a.project])).rows[0]).toEqual({version:1,current_design_id:null,scene_catalog:[]});
 expect((await db.pool.query('SELECT count(*)::int n FROM design_revision WHERE project_id=$1',[a.project])).rows[0].n).toBe(0);
 expect((await db.pool.query('SELECT count(*)::int n FROM job WHERE project_id=$1',[a.project])).rows[0].n).toBe(0);
 expect((await db.pool.query('SELECT credits_available,credits_held FROM account WHERE id=$1',[a.actor])).rows[0]).toEqual({credits_available:30,credits_held:0});
 expect((await db.pool.query('SELECT count(*)::int n FROM spend_budget')).rows[0].n).toBe(0);
});
