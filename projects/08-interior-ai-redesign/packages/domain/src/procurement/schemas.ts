import Decimal from 'decimal.js';
import {z} from 'zod';
import {uuid} from '../common.js';
const text=z.string().trim().min(1).max(240);
const ExactDecimal=Decimal.clone({precision:80});
const decimal=(max='100000000',positive=false)=>z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/).refine(v=>{try{const n=new ExactDecimal(v);return n.isFinite()&&(positive?n.gt(0):n.gte(0))&&n.lte(max)&&n.toString()===v;}catch{return false;}});
const https=z.string().url().max(2048).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}});
const money=z.number().int().min(0).max(1_000_000_000_000);
export const productInputShape=z.object({retailer:text,seller:text.nullable().optional(),article:text.nullable().optional(),name:text,sourceURL:https,
 region:text.nullable().optional(),store:text.nullable().optional(),observedAt:z.string().datetime({offset:true}).nullable().optional(),source:z.enum(['manual','api','scraper','demo']),
 freshness:z.enum(['fresh','stale','unknown','blocked']),priceMinor:money.nullable().optional(),baseUnit:z.enum(['m2','l','kg','m','piece']),saleUnit:z.enum(['pack','piece']),
 coverage:decimal('100000000',true).nullable().optional(),stock:z.enum(['in_stock','out_of_stock','unknown']),stockQty:decimal().nullable().optional(),
 dimensionsM:z.tuple([decimal('100'),decimal('100'),decimal('100')]).nullable().optional(),confirmed:z.boolean().optional()}).strict();
export const lineInputShape=z.object({designId:uuid,elementId:z.string().min(1).max(120),selection:z.enum(['matched','unmatched','retained']),retainedReason:z.string().trim().min(1).max(300).nullable().optional(),snapshotId:uuid.nullable().optional(),
 quantitySource:z.enum(['floor_area','wall_area','surface_area','manual']),sourceShellId:uuid.nullable().optional(),quantityConfirmed:z.boolean(),baseQuantity:decimal().nullable().optional(),wastePct:decimal('100'),phase:z.enum(['preparation','finishing','furnishing']),fit:z.enum(['bbox_checked','unconfirmed']).default('unconfirmed')}).strict();
export const linePatchShape=z.object({phase:z.enum(['preparation','finishing','furnishing']).optional(),snapshotId:uuid.nullable().optional(),selection:z.enum(['matched','unmatched','retained']).optional(),retainedReason:z.string().trim().min(1).max(300).nullable().optional(),quantitySource:z.enum(['floor_area','wall_area','surface_area','manual']).optional(),sourceShellId:uuid.nullable().optional(),quantityConfirmed:z.boolean().optional(),baseQuantity:decimal().nullable().optional(),wastePct:decimal('100').optional(),fit:z.enum(['bbox_checked','unconfirmed']).optional(),confirmReplacement:z.literal(true).optional(),expectedLineVersion:z.number().int().positive()}).strict().refine(v=>Object.keys(v).some(key=>key!=='expectedLineVersion'&&key!=='confirmReplacement'),{message:'empty'});
export const costRowShape=z.object({id:z.string().min(1).max(120),label:text,kind:z.enum(['confirmed','estimate','unknown','excluded']),amountMinor:money.nullable().default(null),reason:z.string().trim().min(1).max(300).nullable().default(null)}).strict();
export const budgetInputShape=z.object({designId:uuid,services:z.array(costRowShape).min(1).max(50),delivery:z.array(costRowShape).min(1).max(50),reservePct:decimal('100'),reserveBase:z.enum(['known_subtotal','scenario_subtotal']),limitMinor:z.number().int().min(0).max(100_000_000_000_000).nullable().optional(),reason:z.string().trim().min(1).max(300)}).strict();
export const listQueryShape=z.object({limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict();

export const lineListQueryShape=listQueryShape.extend({designId:uuid.optional()});
