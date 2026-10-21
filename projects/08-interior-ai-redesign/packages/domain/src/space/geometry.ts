import Decimal from 'decimal.js';
import { z } from 'zod';
import { DomainError, canonical } from '../common.js';
const D = Decimal.clone({ precision: 40, toExpNeg: -30, toExpPos: 40 });
export type WallId = 'north' | 'east' | 'south' | 'west';
export interface Opening { id:string; wallId:WallId; offsetM:string; widthM:string; heightM:string; sillM:string }
export interface ManualRoom { lengthM:string; widthM:string; heightM:string; openings:Opening[] }
export type Point3 = [number,number,number];
export interface Anchor { a:Point3; b:Point3; measuredM:string }
export interface Calibration { method?:'measured'|'native'; anchors:Anchor[]; scale:string; toleranceM:string|null; checks:{actualM:string;measuredM:string;deltaM:string}[]; userConfirmed:boolean }
export interface GLBDescriptor { assetId:string; originalHash:string; normalizationMatrix:number[]; vertexCount:number; triangleCount:number; nodeCount:number; surfaceIds:string[] }
export interface ShellContent { mode:'manual'|'glb'; units:'m'; sourceAssetId:string|null; geometry:ManualRoom|GLBDescriptor; calibration:Calibration; floorAreaM2:string|null; floorAreaSource:'manual_geometry'|'user_confirmed'|'unknown' }
export interface ShellRevision extends ShellContent { id:string; projectId:string; parentId:string|null; hash:string; confirmedAt:string; createdAt:string }
export function invalid(message:string):never { throw new DomainError(422,'INVALID_SPACE',message); }
export function parseDecimal(value:unknown,min:string,max:string,name='Размер'):string {
 if(typeof value!=='string'||!/^\d{1,8}(?:\.\d{1,12})?$/.test(value)) return invalid(`${name}: нужна десятичная строка`);
 const n=new D(value); if(n.lt(min)||n.gt(max)) return invalid(`${name}: вне диапазона ${min}–${max}`); return n.toFixed();
}
const openingShape=z.object({id:z.string().min(1).max(80).regex(/^[\p{L}\p{N}_:-]+$/u),wallId:z.enum(['north','east','south','west']),offsetM:z.unknown(),widthM:z.unknown(),heightM:z.unknown(),sillM:z.unknown()}).strict();
const roomShape=z.object({lengthM:z.unknown(),widthM:z.unknown(),heightM:z.unknown(),openings:z.array(openingShape).max(64)}).strict();
export function validateManualRoom(input:unknown):ManualRoom {
 const parsed=roomShape.safeParse(input); if(!parsed.success) return invalid('Некорректная комната или проёмы');
 const raw=parsed.data;
 const room:ManualRoom={lengthM:parseDecimal(raw.lengthM,'0.5','50','Длина'),widthM:parseDecimal(raw.widthM,'0.5','50','Ширина'),heightM:parseDecimal(raw.heightM,'1.5','10','Высота'),openings:raw.openings.map(o=>({id:o.id,wallId:o.wallId,offsetM:parseDecimal(o.offsetM,'0','50'),widthM:parseDecimal(o.widthM,'0.001','50'),heightM:parseDecimal(o.heightM,'0.001','10'),sillM:parseDecimal(o.sillM,'0','10')}))};
 if(new Set(room.openings.map(o=>o.id)).size!==room.openings.length) invalid('Повторяющийся идентификатор проёма');
 for(const [index,o] of room.openings.entries()) {
  if(new D(o.offsetM).plus(o.widthM).gt(wallLengthM(room,o.wallId))||new D(o.sillM).plus(o.heightM).gt(room.heightM)) invalid('Проём выходит за границы стены');
  for(const other of room.openings.slice(0,index)) if(o.wallId===other.wallId && new D(o.offsetM).lt(new D(other.offsetM).plus(other.widthM)) && new D(other.offsetM).lt(new D(o.offsetM).plus(o.widthM)) && new D(o.sillM).lt(new D(other.sillM).plus(other.heightM)) && new D(other.sillM).lt(new D(o.sillM).plus(o.heightM))) invalid('Проёмы перекрываются');
 }
 room.openings.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0); return room;
}
export function wallLengthM(room:ManualRoom,wall:WallId):string {return wall==='north'||wall==='south'?room.lengthM:room.widthM;}
export function wallAreaM2(room:ManualRoom,wall:WallId):string { return room.openings.filter(o=>o.wallId===wall).reduce((area,o)=>area.minus(new D(o.widthM).mul(o.heightM)),new D(wallLengthM(room,wall)).mul(room.heightM)).toFixed(); }
export function createManualShell(input:unknown,confirmed:unknown):ShellContent {
 if(confirmed!==true) throw new DomainError(409,'CALIBRATION_REQUIRED','Подтвердите размеры основы');
 const geometry=validateManualRoom(input); return {mode:'manual',units:'m',sourceAssetId:null,geometry,calibration:{anchors:[],scale:'1',toleranceM:null,checks:[],userConfirmed:true},floorAreaM2:new D(geometry.lengthM).mul(geometry.widthM).toFixed(),floorAreaSource:'manual_geometry'};
}
const point=z.tuple([z.number().finite().min(-1e6).max(1e6),z.number().finite().min(-1e6).max(1e6),z.number().finite().min(-1e6).max(1e6)]);
const calibrationShape=z.object({anchors:z.array(z.object({a:point,b:point,measuredM:z.unknown()}).strict()).min(1).max(16),toleranceM:z.unknown().optional(),userConfirmed:z.literal(true),floorAreaM2:z.unknown().optional(),floorAreaConfirmed:z.boolean().optional()}).strict();
export function calibrateGlb(input:unknown,asset:Omit<GLBDescriptor,'normalizationMatrix'>):ShellContent {
 if(input&&typeof input==='object'&&'method' in input&&input.method==='native'){
  const native=z.object({method:z.literal('native'),userConfirmed:z.literal(true),floorAreaM2:z.unknown().optional(),floorAreaConfirmed:z.boolean().optional()}).strict().safeParse(input);
  if(!native.success)throw new DomainError(409,'CALIBRATION_REQUIRED','Подтвердите исходный масштаб 1:1');
  const area=native.data.floorAreaM2===undefined?null:parseDecimal(native.data.floorAreaM2,'0.001','10000','Площадь');if(area!==null&&native.data.floorAreaConfirmed!==true)invalid('Подтвердите отдельно введённую площадь');
  return{mode:'glb',units:'m',sourceAssetId:asset.assetId,geometry:{...asset,normalizationMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},calibration:{method:'native',anchors:[],scale:'1',toleranceM:null,checks:[],userConfirmed:true},floorAreaM2:area,floorAreaSource:area===null?'unknown':'user_confirmed'};
 }
 const parsed=calibrationShape.safeParse(input); if(!parsed.success) throw new DomainError(409,'CALIBRATION_REQUIRED','Нужны опорный отрезок и подтверждение масштаба');
 const raw=parsed.data; const anchors=raw.anchors.map(a=>({...a,measuredM:parseDecimal(a.measuredM,'0.001','1000','Длина отрезка')}));
 const distance=(a:Anchor)=>a.a.reduce((sum,v,i)=>sum.plus(new D(v.toString()).minus(a.b[i]!.toString()).pow(2)),new D(0)).sqrt();
 const first=distance(anchors[0]!); if(first.lte('0.000000001')) invalid('Опорные точки совпадают');
 const scale=new D(anchors[0]!.measuredM).div(first); if(scale.lt('0.000001')||scale.gt('1000000')) invalid('Недопустимый масштаб');
 const toleranceM=raw.toleranceM===undefined?null:parseDecimal(raw.toleranceM,'0','100','Допуск');
 if(anchors.length>1&&toleranceM===null) invalid('Укажите допуск для контрольных отрезков');
 const checks=anchors.slice(1).map(a=>{ const d=distance(a); if(d.lte('0.000000001')) invalid('Контрольные точки совпадают'); const actual=d.mul(scale); const delta=actual.minus(a.measuredM).abs(); if(delta.gt(toleranceM!)) invalid('Контрольный отрезок превышает ваш допуск'); return {actualM:actual.toFixed(),measuredM:a.measuredM,deltaM:delta.toFixed()}; });
 const floorAreaM2=raw.floorAreaM2===undefined?null:parseDecimal(raw.floorAreaM2,'0.001','10000','Площадь');
 if(floorAreaM2!==null&&raw.floorAreaConfirmed!==true) invalid('Подтвердите отдельно введённую площадь');
 const s=scale.toNumber(); return {mode:'glb',units:'m',sourceAssetId:asset.assetId,geometry:{...asset,normalizationMatrix:[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1]},calibration:{anchors,scale:scale.toFixed(),toleranceM,checks,userConfirmed:true},floorAreaM2,floorAreaSource:floorAreaM2===null?'unknown':'user_confirmed'};
}
export function canonicalShellContent(content:ShellContent):string {return canonical(content);}
