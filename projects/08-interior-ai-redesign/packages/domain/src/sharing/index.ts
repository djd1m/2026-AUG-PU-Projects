import { z } from 'zod';
import { DomainError, uuid } from '../common.js';
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPORT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPORT_SCHEMA_VERSION = 1;
export const growthKinds = ['first_design_viewed','export_created','share_created','share_viewed','new_project_from_share'] as const;
export type GrowthKind = typeof growthKinds[number];
export interface ExportProvenance {schemaVersion:1;designId:string;designHash:string;normalizedHash:string;watermarked:boolean;width:number;height:number}
export interface ExportPreview {id:string;designId:string;imageURL:string;watermarked:boolean;width:number;height:number}
export interface PublicShare {caption:string;imageURL:string}
const publishSchema=z.object({designId:uuid,assetId:uuid,caption:z.string().trim().max(500),rightsConfirmed:z.literal(true),previewConfirmed:z.literal(true)}).strict();
export function parsePublish(input:unknown){const result=publishSchema.safeParse(input);if(!result.success)throw new DomainError(422,'INVALID_SHARE','Проверьте подпись и подтвердите просмотр и права');return result.data;}
const provenanceSchema=z.object({schemaVersion:z.literal(1),designId:uuid,designHash:z.string().regex(/^[a-f0-9]{64}$/),normalizedHash:z.string().regex(/^[a-f0-9]{64}$/),watermarked:z.boolean(),width:z.number().int().min(128).max(8192),height:z.number().int().min(64).max(8192)}).strict();
export function provenance(input:unknown):ExportProvenance {const parsed=provenanceSchema.safeParse(input);if(!parsed.success||parsed.data.width*parsed.data.height>20_000_000)throw new DomainError(404,'NOT_FOUND','Изображение не найдено');return parsed.data;}
export function needsWatermark(paidExport:boolean,billingHold:boolean):boolean{return paidExport!==true||billingHold!==false;}
export function publicShare(caption:string,token:string):PublicShare {return {caption,imageURL:`/api/shared/${token}/image`};}
export interface ExportReservation {id:string;originalKey:string;normalizedKey:string;watermarked:boolean;designId:string;designHash:string}
export interface ExportResult {bytes:number;hash:string;width:number;height:number}
export interface ExportStore {
 reserveExport(actorId:string,projectId:string,version:number,designId:string):Promise<ExportReservation>;
 finishExport(actorId:string,projectId:string,version:number,reserved:ExportReservation,result:ExportResult,requestId:string):Promise<{asset:ExportPreview;version:number}>;
 releaseExport(actorId:string,projectId:string,id:string):Promise<void>;
}
