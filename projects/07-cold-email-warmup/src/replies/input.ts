import { HttpError } from '../errors.js';
export const MAX_HEADERS=100, MAX_HEADER_BYTES=8192, MAX_REFERENCES=50, MAX_MESSAGE_ID_BYTES=254;
export interface HeaderInput { uid:number; from:string; references?:string[]; inReplyTo?:string; messageId?:string }
export interface ReplyHeader { uid:number; sender:string|null; references:string[]; messageId:string|null }
export interface PageInput {
 runId:string; attempt:number; uidvalidity:string; expectedCursor:number; coveredThrough:number;
 kind:'scan'|'tail'; headers:HeaderInput[];
 // Trusted protocol reader supplies successful coverage and operation timestamps, never HTTP clients.
 startedAt:Date; completedAt:Date;
}
const invalid=()=>new HttpError(400,'invalid_reply_page');
export function uid(value:unknown,zero=false):number {
 if(typeof value!=='number' || !Number.isInteger(value) || value<(zero?0:1) || value>4294967295) throw invalid();return value;
}
export function validity(value:unknown):string {
 if(typeof value!=='string' || !/^[1-9][0-9]{0,9}$/.test(value) || Number(value)>4294967295) throw invalid();return value;
}
export function singleAddress(value:string):string|null {
 const trimmed=value.trim();
 const address=trimmed.match(/^(?:[^<>\r\n,;]*<([^<>]+)>|([^<>]+))$/)?.slice(1).find(Boolean)?.trim().toLowerCase();
 return address && address.length<=254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address)?address:null;
}
export function messageId(value:string):string|null {
 const id=value.trim();
 // Canonical sent IDs are opaque. Preserve local-part case; normalize only the domain.
 if(Buffer.byteLength(id)>MAX_MESSAGE_ID_BYTES || !/^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$/.test(id)) return null;
 const at=id.lastIndexOf('@');return id.slice(0,at+1)+id.slice(at+1).toLowerCase();
}
export function date(value:unknown):Date {
 if(!(value instanceof Date) || !Number.isFinite(value.getTime())) throw invalid();return new Date(value);
}
export function parsePage(raw:PageInput):Omit<PageInput,'headers'> & {headers:ReplyHeader[]} {
 if(!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.runId) || !Number.isInteger(raw.attempt) || raw.attempt<1 || !['scan','tail'].includes(raw.kind)) throw invalid();
 const expectedCursor=uid(raw.expectedCursor,true),coveredThrough=uid(raw.coveredThrough,true);
 if(coveredThrough<expectedCursor || (raw.kind==='scan' && coveredThrough===expectedCursor) || !Array.isArray(raw.headers) || raw.headers.length>MAX_HEADERS) throw invalid();
 const seen=new Set<number>();
 const headers=raw.headers.map(h=>{
  if(!h || typeof h!=='object' || Object.keys(h).some(k=>!['uid','from','references','inReplyTo','messageId'].includes(k))) throw invalid();
  const n=uid(h.uid);if(n<=expectedCursor || n>coveredThrough || seen.has(n)) throw invalid();seen.add(n);
  if(typeof h.from!=='string' || (h.references!==undefined && (!Array.isArray(h.references) || h.references.length>MAX_REFERENCES))) throw invalid();
  const strings=[h.from,...h.references??[],...h.inReplyTo===undefined?[]:[h.inReplyTo],...h.messageId===undefined?[]:[h.messageId]];
  if(strings.some(s=>typeof s!=='string' || /[\r\n\0]/.test(s)) || strings.reduce((n,s)=>n+Buffer.byteLength(s),0)>MAX_HEADER_BYTES) throw invalid();
  const refs=[...h.references??[],...h.inReplyTo===undefined?[]:[h.inReplyTo]];if(refs.length>MAX_REFERENCES) throw invalid();
  return {uid:n,sender:singleAddress(h.from),references:[...new Set(refs.map(messageId).filter((s):s is string=>s!==null))],messageId:h.messageId===undefined?null:messageId(h.messageId)};
 });
 return {runId:raw.runId,attempt:raw.attempt,uidvalidity:validity(raw.uidvalidity),expectedCursor,coveredThrough,kind:raw.kind,headers,startedAt:date(raw.startedAt),completedAt:date(raw.completedAt)};
}
