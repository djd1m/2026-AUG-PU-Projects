import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {PgDesigns} from '@n8/db/design';
import {createSharingRepository} from '../../packages/db/src/sharing.js';
import {setup,revision} from '../design/fixtures.js';
export async function fixture(pool:Pool){const f=await setup(pool);const created=await new PgDesigns(pool).create(f.actor,f.project,1,revision(f.scene));return {...f,designId:created.design.id,version:created.version,repo:createSharingRepository(pool)};}
export async function exported(f:Awaited<ReturnType<typeof fixture>>,hash='a'.repeat(64)){const reserved=await f.repo.reserveExport(f.actor,f.project,f.version,f.designId);const result=await f.repo.finishExport(f.actor,f.project,f.version,reserved,{bytes:100,hash,width:640,height:320},randomUUID());f.version=result.version;return result.asset;}
export function publication(designId:string,assetId:string){return{designId,assetId,caption:'Комната <script>private</script>',rightsConfirmed:true,previewConfirmed:true};}
export async function waitForWaiter(pool:Pool,fragment:string){const deadline=Date.now()+3000;while(Date.now()<deadline){const result=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",[`%${fragment}%`]);if(result.rows[0].n>0)return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected PostgreSQL lock barrier was not reached');}
