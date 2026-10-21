import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {freshDb} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/tests/helpers/db.ts';
import {setup,revision} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/tests/design/fixtures.ts';
import {PgDesigns} from '@n8/db/design';
import {PgProjects,PgRateGate} from '@n8/db/identity';
import {PgProcurement} from '@n8/db/procurement';
import {catalogHandler} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/apps/web/src/server/design.ts';
import {createProcurementHandlers} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/apps/web/src/server/procurement.ts';
import {allPages} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/apps/web/src/lib/api-client.ts';
import type {Base} from '/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/apps/web/src/server/composition.ts';
const db=await freshDb();
const headers={cookie:'n8_session='+'a'.repeat(43),'x-n8-peer':'127.0.0.1'};
const checks:string[]=[];
function base(actor:string){return{pool:db.pool,config:{publicOrigin:'http://localhost:3000',aiMode:'manual'},auth:{authenticate:async()=>({accountId:actor})},projects:new PgProjects(db.pool),rate:new PgRateGate(db.pool),hashSubject:(s:string)=>s} as unknown as Base;}
try{
 const f=await setup(db.pool),foreign=await setup(db.pool),designs=new PgDesigns(db.pool);
 const catalog=Array.from({length:100},(_,i)=>({id:randomUUID(),name:`entry ${i}`,primitive:'box' as const,dimensionsM:['0.001','0.001','0.001'] as [string,string,string],source:'manual' as const}));
 await db.pool.query('UPDATE project SET scene_catalog=$1 WHERE id=$2',[JSON.stringify(catalog),f.project]);
 const cat=(q='')=>catalogHandler('GET',f.project,base(f.actor))(new Request('http://localhost:3000/api/catalog'+q,{headers}));
 const first=await(await cat()).json(),second=await(await cat('?after='+first.data.nextCursor)).json();
 assert.deepEqual([...first.data.items,...second.data.items],catalog);assert.equal(second.data.nextCursor,null);assert.equal(first.data.items.length,50);assert.equal(second.data.items.length,50);
 assert.equal((await cat('?after='+catalog[99]!.id)).status,200);assert.deepEqual((await(await cat('?after='+catalog[99]!.id)).json()).data,{items:[],nextCursor:null});
 for(const q of ['?cursor='+catalog[0]!.id,'?after='+catalog[0]!.id+'&after='+catalog[1]!.id,'?limit=51'])assert.equal((await cat(q)).status,400);
 for(const q of ['?after=bad','?after=','?after='+randomUUID()])assert.equal((await cat(q)).status,404);
 checks.push('Catalog 100 entries traversed as exactly 50+50; terminal empty page and strict unknown/duplicate/malformed query statuses');
 let version=1;const created=[];
 for(const count of [2,51]){
  const objects=Array.from({length:count},(_,i)=>({id:randomUUID(),catalogId:catalog[0]!.id,positionM:[.01+i*.02,0,1] as [number,number,number],rotationY:0,dimensionsM:catalog[0]!.dimensionsM}));
  const design=await designs.create(f.actor,f.project,version,revision({...f.scene,objects}));version=design.version;
  const rows=await db.pool.query("INSERT INTO shopping_line(project_id,design_id,element_id,selection,retained_reason,quantity_source,source_shell_id,quantity_confirmed,waste_pct,phase,fit,created_at) SELECT $1,$2,o->>'id','retained','Existing item','manual',$3,false,'0','furnishing','unconfirmed','2026-10-13T12:00:00Z' FROM jsonb_array_elements($4::jsonb) o RETURNING id",[f.project,design.design.id,f.shell.id,JSON.stringify(objects)]);
  created.push({id:design.design.id,ids:rows.rows.map(r=>r.id as string)});
 }
 const history=created[0]!,current=created[1]!,repo=new PgProcurement(db.pool),handlers=createProcurementHandlers(base(f.actor),repo);
 const request=(q='')=>handlers.lines(new Request('http://localhost:3000/api/lines'+q,{headers}),f.project);
 const a=await repo.listLines(f.actor,f.project,50,undefined,current.id),b=await repo.listLines(f.actor,f.project,50,a.nextCursor!,current.id);
 assert.equal(a.items.length,50);assert.equal(b.items.length,1);assert.equal(b.nextCursor,null);assert.equal(new Set([...a.items,...b.items].map(l=>l.id)).size,51);assert.deepEqual([...a.items,...b.items].map(l=>l.id).sort(),current.ids.sort());
 assert.ok([...a.items,...b.items].every(l=>l.designId===current.id));
 const old=await repo.listLines(f.actor,f.project,50,undefined,history.id);assert.equal(old.items.length,2);
 const all1=await repo.listLines(f.actor,f.project),all2=await repo.listLines(f.actor,f.project,50,all1.nextCursor!);assert.equal(all1.items.length+all2.items.length,53);
 checks.push('51 current lines with tied created_at traverse as 50+1 with no omissions/duplicates; owned historical design remains readable; unfiltered 53-row history remains available');
 const foreignDesign=await designs.create(foreign.actor,foreign.project,1,revision(foreign.scene));
 for(const q of ['?designId='+current.id+'&cursor='+history.ids[0],'?designId='+foreignDesign.design.id,'?designId='+randomUUID(),'?designId='+current.id+'&cursor='+randomUUID()]){const r=await request(q);assert.equal(r.status,404);assert.equal((await r.json()).error.code,'NOT_FOUND');}
 for(const q of ['?designId=bad','?designId='+current.id+'&designId='+current.id,'?designId='+current.id+'&limit=51','?designId='+current.id+'&unknown=x','?designId='+current.id+'&cursor='+a.nextCursor+'&cursor='+a.nextCursor])assert.equal((await request(q)).status,400);
 assert.equal((await createProcurementHandlers(base(foreign.actor),repo).lines(new Request('http://localhost:3000/api?designId='+current.id,{headers}),f.project)).status,404);
 checks.push('HTTP rejects foreign account/project/design, unknown design/cursor, same-project other-design cursor; strict query rejects duplicate/invalid/unknown keys');
 const originalFetch=globalThis.fetch,calls:string[]=[],controller=new AbortController();
 globalThis.fetch=async(input,init)=>{assert.equal(init?.signal,controller.signal);calls.push(String(input));return handlers.lines(new Request('http://localhost:3000'+String(input),{headers}),f.project);};
 try{const client=await allPages<{id:string;designId:string}>('/api/lines?designId='+current.id,controller.signal,'cursor');assert.equal(client.length,51);assert.equal(calls.length,2);assert.ok(calls[1]!.startsWith('/api/lines?designId='+current.id+'&cursor='));assert.ok(client.every(l=>l.designId===current.id));}finally{globalThis.fetch=originalFetch;}
 checks.push('Actual allPages to HTTP/PG handler traverses 51 current lines, preserves designId on page two, forwards same cancellation signal');
 console.log(JSON.stringify({status:'passed',checks},null,2));
}finally{await db.close();}
