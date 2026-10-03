import { HttpError } from '../errors.js';
export const METRICS = {inbox_placement:'Inbox placement',spam_placement:'Spam placement',delivered:'Delivered'} as const;
export interface Observation {
 sourceUrl:string; reference:string; observedAt:string; windowStart:string; windowEnd:string;
 metric:keyof typeof METRICS; unit:'count'; direction:'higher'|'lower'; numerator:number; denominator:number; manualVerified:true;
}
const fields=['sourceUrl','reference','observedAt','windowStart','windowEnd','metric','unit','direction','numerator','denominator','manualVerified'];
function invalid():never {throw new HttpError(400,'invalid_input');}
function utc(value:unknown):string {
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) return invalid();
 if(new Date(value).toISOString()!==value) return invalid();return value;
}
export function observationInput(input:Record<string,unknown>):Observation {
 if(Object.keys(input).length!==fields.length || fields.some(k=>!(k in input))) return invalid();
 if(typeof input.sourceUrl!=='string' || input.sourceUrl.length>2048 || typeof input.reference!=='string' || input.reference.trim().length<1 || input.reference.length>500 || /[\u0000-\u001f\u007f]/.test(input.reference+input.sourceUrl)) return invalid();
 try {const url=new URL(input.sourceUrl);if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.origin==='null') return invalid();} catch {return invalid();}
 if(typeof input.metric!=='string' || !Object.hasOwn(METRICS,input.metric) || input.unit!=='count' || typeof input.direction!=='string' || !['higher','lower'].includes(input.direction) || input.manualVerified!==true) return invalid();
 if(!Number.isSafeInteger(input.numerator) || !Number.isSafeInteger(input.denominator) || Number(input.numerator)<0 || Number(input.denominator)<0 || Number(input.denominator)>1e9 || Number(input.numerator)>Number(input.denominator)) return invalid();
 const observedAt=utc(input.observedAt),windowStart=utc(input.windowStart),windowEnd=utc(input.windowEnd);
 if(windowStart>=windowEnd || windowEnd>observedAt) return invalid();
 const direction=input.direction;
 return {...input,direction,observedAt,windowStart,windowEnd} as unknown as Observation;
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidInput(value:string):string {if(!UUID.test(value)) throw new HttpError(404,'not_found');return value.toLowerCase();}
export function keyInput(value:unknown):string {if(typeof value!=='string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) return invalid();return value;}
export function pageInput(url:string) {
 const query=new URL(url,'http://local').searchParams;
 const parse=(name:string,fallback:number,max:number)=>{const raw=query.get(name);if(raw===null)return fallback;if(!/^\d{1,5}$/.test(raw))return invalid();const n=Number(raw);if(n>max || (name==='limit' && n<1))return invalid();return n;};
 return {limit:parse('limit',50,100),offset:parse('offset',0,10000)};
}
