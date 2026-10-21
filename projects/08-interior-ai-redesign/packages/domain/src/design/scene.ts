import Decimal from 'decimal.js';
import {appearanceShape} from './appearance.js';
import {z} from 'zod';
import {DomainError,uuid} from '../common.js';
import type {ShellContent,ManualRoom,GLBDescriptor} from '../space/index.js';
const decimal=z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,12})?$/).refine(v=>new Decimal(v).gt(0)&&new Decimal(v).lte(100)&&new Decimal(v).toFixed()===v);
const dimensions=z.tuple([decimal,decimal,decimal]);
const text=z.string().max(120).regex(/^[\p{L}\p{N} _.,:()\-]+$/u);
export const catalogShape=z.object({id:uuid,name:text.min(1),primitive:z.enum(['box','cylinder']),dimensionsM:dimensions,source:z.enum(['manual','product']),snapshotId:uuid.optional()}).strict();
export const catalogInputShape=catalogShape.omit({id:true,source:true});
export type ObjectDefinition=z.infer<typeof catalogShape>;
export const sceneShape=z.object({shellId:uuid,shellHash:z.string().regex(/^[a-f0-9]{64}$/),materials:z.array(z.object({surfaceId:z.string().max(80),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),materialCode:z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)}).strict()).max(100),appearance:appearanceShape.optional(),objects:z.array(z.object({color:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),id:uuid,catalogId:uuid,positionM:z.tuple([z.number().finite().min(-1000).max(1000),z.number().finite().min(-1000).max(1000),z.number().finite().min(-1000).max(1000)]),rotationY:z.number().finite().min(-Math.PI*2).max(Math.PI*2),dimensionsM:dimensions}).strict()).max(200)}).strict();
export type SceneProposal=z.infer<typeof sceneShape>;
export type SceneShell=ShellContent&{id:string;hash:string;confirmedAt?:string|null};
export type Fit='bbox_checked'|'unconfirmed';
export interface DesignRevision {id:string;projectId:string;parentId:string|null;shellId:string;shellHash:string;scene:SceneProposal;referenceIds:string[];style:string;mode:'manual'|'demo'|'live';state:'draft'|'approved'|'superseded';fit:Fit;approvedAt:string|null;changeReason:string;createdAt:string}
export function sceneInvalid(message='Недопустимая сцена'):never{throw new DomainError(422,'SCENE_INVALID',message);}
export function validateCatalog(input:unknown):ObjectDefinition {const p=catalogShape.safeParse(input);if(!p.success)sceneInvalid('Некорректный объект каталога');return p.data;}
export function surfaceIds(shell:ShellContent):string[]{return shell.mode==='manual'?['floor','ceiling','wall:north','wall:east','wall:south','wall:west']:(shell.geometry as GLBDescriptor).surfaceIds;}
type Box={min:number[];max:number[]};
export function objectBox(o:SceneProposal['objects'][number]):Box{const [w,h,d]=o.dimensionsM.map(Number);const c=Math.abs(Math.cos(o.rotationY)),s=Math.abs(Math.sin(o.rotationY));const x=(w!*c+d!*s)/2,z=(w!*s+d!*c)/2;return{min:[o.positionM[0]-x,o.positionM[1],o.positionM[2]-z],max:[o.positionM[0]+x,o.positionM[1]+h!,o.positionM[2]+z]};}
function overlaps(a:Box,b:Box):boolean{return a.min.every((v,i)=>v<b.max[i]!-1e-9&&b.min[i]!<a.max[i]!-1e-9);}
function openingBoxes(room:ManualRoom):Box[]{return room.openings.map(o=>{const offset=Number(o.offsetM),w=Number(o.widthM),y=Number(o.sillM),h=Number(o.heightM),x=Number(room.lengthM),z=Number(room.widthM);const clearance=0.9;switch(o.wallId){case 'north':return{min:[offset,y,0],max:[offset+w,y+h,clearance]};case 'south':return{min:[offset,y,z-clearance],max:[offset+w,y+h,z]};case 'west':return{min:[0,y,offset],max:[clearance,y+h,offset+w]};case 'east':return{min:[x-clearance,y,offset],max:[x,y+h,offset+w]};}});}
export function validateScene(input:unknown,shell:SceneShell,catalog:readonly ObjectDefinition[]):{scene:SceneProposal;fit:Fit}{
 const parsed=sceneShape.safeParse(input);if(!parsed.success)sceneInvalid();const scene=parsed.data;
 if(scene.shellId!==shell.id||scene.shellHash!==shell.hash)sceneInvalid('Основа изменена');
 const surfaces=new Set(surfaceIds(shell));if(scene.materials.some(m=>!surfaces.has(m.surfaceId))||new Set(scene.materials.map(m=>m.surfaceId)).size!==scene.materials.length)sceneInvalid('Неизвестная или повторяющаяся поверхность');
 if(new Set(scene.objects.map(o=>o.id)).size!==scene.objects.length)sceneInvalid('Повторяющийся объект');
 for(const o of scene.objects){const c=catalog.find(c=>c.id===o.catalogId);if(!c)throw new DomainError(404,'NOT_FOUND','Не найдено');if(o.dimensionsM.some((v,i)=>v!==c.dimensionsM[i]))sceneInvalid('Изменённые размеры');}
 if(shell.mode==='glb')return{scene,fit:'unconfirmed'};
 const room=shell.geometry as ManualRoom,bounds=[Number(room.lengthM),Number(room.heightM),Number(room.widthM)],openings=openingBoxes(room),boxes=scene.objects.map(objectBox);
 for(const [i,box] of boxes.entries()){if(box.min.some(v=>v< -1e-9)||box.max.some((v,i)=>v>bounds[i]!+1e-9))sceneInvalid('Объект выходит за границы комнаты');if(openings.some(o=>overlaps(box,o)))sceneInvalid('Объект перекрывает зону проёма');if(boxes.slice(0,i).some(o=>overlaps(box,o)))sceneInvalid('Габариты объектов пересекаются');}
 return{scene,fit:'bbox_checked'};
}
export const revisionShape=z.object({scene:sceneShape,referenceIds:z.array(uuid).max(100),style:z.string().trim().min(1).max(120),changeReason:z.string().trim().min(1).max(300),parentId:uuid.nullable().optional()}).strict();
export type RevisionInput=z.infer<typeof revisionShape>;
