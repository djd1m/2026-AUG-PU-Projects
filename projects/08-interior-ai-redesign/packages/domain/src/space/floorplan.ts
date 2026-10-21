import Decimal from 'decimal.js';
import {z} from 'zod';
import {DomainError} from '../common.js';
export type DimensionUnit='mm'|'cm'|'m';
export interface OcrWord {text:string;confidence:number;line:string;box:{x:number;y:number;width:number;height:number}}
export interface DimensionCandidate {id:string;rawText:string;value:string;unit:DimensionUnit|null;confidence:number;box:OcrWord['box']}
export interface DrawingRecognition {assetId:string;width:number;height:number;candidates:DimensionCandidate[];warnings:string[]}
const box=z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),width:z.number().finite().positive().max(1),height:z.number().finite().positive().max(1)}).strict().refine(b=>b.x+b.width<=1.001&&b.y+b.height<=1.001);
const words=z.array(z.object({text:z.string().max(100),confidence:z.number().finite().min(0).max(100),line:z.string().max(80),box}).strict()).max(2000);
const units=new Map<string,DimensionUnit>([['mm','mm'],['мм','mm'],['cm','cm'],['см','cm'],['m','m'],['м','m']]);
const unitOf=(text:string):DimensionUnit|null=>units.get(text.toLowerCase())??null;
/** Printed numbers are candidates, never evidence of their role, scale, room shape or confirmation. */
export function extractDrawingDimensions(input:unknown):DimensionCandidate[] {
 const result=words.safeParse(input);if(!result.success)throw new DomainError(422,'INVALID_DRAWING_OCR','Некорректный результат распознавания');
 const all=result.data.filter(w=>w.text.trim());const found:DimensionCandidate[]=[];
 for(const [index,w] of all.entries()){
  if(w.confidence<35)continue;
  const text=w.text.trim().replace(/\u2212/g,'-');
  const peers=all.filter(p=>p.line===w.line);const context=peers.map(p=>p.text).join(' ');
  if(/\d\s*:\s*\d|(?:^|[^\p{L}\p{N}])(?:scale|масштаб)(?:$|[^\p{L}\p{N}])/iu.test(context)||/(?:кв\.?\s*(?:м|см|мм)|(?:m|м|cm|см|mm|мм)\s*(?:²|\^\s*2|2)(?:\b|$))/iu.test(context)||/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(text))continue;
  const next=all[index+1];const nextText=next?.line===w.line?next.text.trim():'';
  if(/(?:м|m|cm|см|mm|мм)(?:²|2|\^2)$|[%°]/iu.test(text)||/^(?:м|m|cm|см|mm|мм)(?:²|2|\^2)$/iu.test(nextText))continue;
  const match=/^(\d{1,6}(?:[.,]\d{1,3})?)\s*(mm|мм|cm|см|m|м)?$/iu.exec(text);if(!match)continue;
  const value=new Decimal(match[1]!.replace(',','.'));if(!value.isFinite()||value.lte(0)||value.gt(100000))continue;
  const adjacent=next&&next.line===w.line&&next.confidence>=35&&((Math.abs(next.box.y-w.box.y)<Math.max(w.box.height,next.box.height)*0.5&&next.box.x>=w.box.x+w.box.width-0.01&&next.box.x-(w.box.x+w.box.width)<=Math.max(0.015,w.box.width*0.5))||(Math.abs(next.box.x-w.box.x)<Math.max(w.box.width,next.box.width)*0.5&&Math.min(Math.abs(next.box.y+next.box.height-w.box.y),Math.abs(w.box.y+w.box.height-next.box.y))<=Math.max(0.015,w.box.height*0.5)));
  const unit=unitOf(match[2]??(adjacent?nextText:''));const normalized=value.toFixed();
  if(found.some(p=>p.value===normalized&&Math.abs(p.box.x-w.box.x)<0.03&&Math.abs(p.box.y-w.box.y)<0.03))continue;
  const evidenceBox=unit&&!match[2]&&next?{x:Math.min(w.box.x,next.box.x),y:Math.min(w.box.y,next.box.y),width:Math.max(w.box.x+w.box.width,next.box.x+next.box.width)-Math.min(w.box.x,next.box.x),height:Math.max(w.box.y+w.box.height,next.box.y+next.box.height)-Math.min(w.box.y,next.box.y)}:w.box;
  found.push({id:`dimension-${found.length+1}`,rawText:match[2]?text:unit?`${text} ${nextText}`:text,value:normalized,unit,confidence:unit&&!match[2]&&next?Math.min(w.confidence,next.confidence):w.confidence,box:evidenceBox});
  if(found.length===128)break;
 }
 return found;
}
export function drawingDimensionMeters(candidate:Pick<DimensionCandidate,'value'|'unit'>,assumedUnit:DimensionUnit|null):string|null {
 const unit=candidate.unit??assumedUnit;if(!unit||!['mm','cm','m'].includes(unit)||!/^\d{1,6}(?:\.\d{1,12})?$/.test(candidate.value))return null;
 return new Decimal(candidate.value).div(unit==='mm'?1000:unit==='cm'?100:1).toFixed();
}
