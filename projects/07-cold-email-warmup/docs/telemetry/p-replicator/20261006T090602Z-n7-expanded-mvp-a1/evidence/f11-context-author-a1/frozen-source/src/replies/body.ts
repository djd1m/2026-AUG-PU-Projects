import { createHash } from 'node:crypto';
export interface InboundRules {version:string;allowed:{case:string;language:string;phrase:string;intent:string;topic:string}[];negative:Record<string,string[]>}
export interface NegativeHeaders {suppressed?:boolean;complaint?:boolean;bounce?:boolean;autoSubmitted?:string;ooo?:boolean;bulk?:boolean;ownLoop?:boolean}
export type BodyResult={kind:'text';text:string}|{kind:'hold';reason:string};
export function parsePlainBody(metadata:Buffer,bytes:Buffer):BodyResult {
 if(metadata.length>8192)return {kind:'hold',reason:'metadata_bounds'};if(bytes.length>32768)return {kind:'hold',reason:'body_bounds'};
 if(metadata.some(b=>b>127||b===0))return {kind:'hold',reason:'unsupported_mime'};
 const fields=new Map<string,string>();let name='';
 for(const line of metadata.toString('ascii').split(/\r?\n/)){if(!line)continue;if(/^[ \t]/.test(line)){if(!name)return {kind:'hold',reason:'unsupported_mime'};fields.set(name,fields.get(name)+' '+line.trim());continue;}const m=/^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line);if(!m)return {kind:'hold',reason:'unsupported_mime'};name=m[1]!.toLowerCase();if(fields.has(name))return {kind:'hold',reason:'unsupported_mime'};fields.set(name,m[2]!);}
 const type=fields.get('content-type')??'text/plain',encoding=(fields.get('content-transfer-encoding')??'7bit').toLowerCase();
 const match=/^text\/plain(?:\s*;\s*charset\s*=\s*"?(utf-8|us-ascii)"?)?\s*$/i.exec(type);
 if(!match||!['7bit','8bit'].includes(encoding)||fields.has('content-disposition'))return {kind:'hold',reason:'unsupported_mime'};
 const charset=(match[1]??'us-ascii').toLowerCase();if((charset==='us-ascii'||encoding==='7bit')&&bytes.some(b=>b>127))return {kind:'hold',reason:'unsupported_encoding'};
 try {const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))return {kind:'hold',reason:'unsupported_encoding'};return {kind:'text',text};}catch{return {kind:'hold',reason:'unsupported_encoding'};}
}
const normalize=(s:string)=>s.normalize('NFC').toLowerCase().trim().replace(/\s+/gu,' ');
export function rulesHash(bytes:Buffer):string {return createHash('sha256').update(bytes).digest('hex');}
export function classifyInbound(h:NegativeHeaders,text:string,rules:InboundRules) {
 const hold=(reason:string)=>({kind:'hold' as const,reason});if(Buffer.byteLength(text)>32768)return hold('body_bounds');
 const input=normalize(text);if(h.suppressed)return hold('stop');if(h.complaint)return hold('complaint');
 for(const reason of ['stop','complaint'])if(rules.negative[reason]?.some(s=>input.includes(normalize(s))))return hold(reason);
 if(h.bounce||h.ooo||h.bulk||h.ownLoop||(h.autoSubmitted!==undefined&&normalize(h.autoSubmitted)!=='no'))return hold('automatic');
 for(const reason of ['hostile','unapproved_commitment','unsupported_authority'])if(rules.negative[reason]?.some(s=>input.includes(normalize(s))))return hold(reason);
 const matches=rules.allowed.filter(r=>normalize(r.phrase)===input);if(matches.length!==1)return hold('ambiguous_language_or_intent');
 const r=matches[0]!;return {kind:'candidate' as const,intent:r.intent,topic:r.topic,language:r.language};
}
