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

// Exact immutable v1 fixture bytes; production does not depend on the test filesystem.
const frozenRulesBytes=Buffer.from("{\n  \"version\": \"inbound-rules-v1\",\n  \"allowed\": [\n    {\n      \"case\": \"C01\",\n      \"language\": \"ru\",\n      \"phrase\": \"Что делает продукт?\",\n      \"intent\": \"product_overview\",\n      \"topic\": \"overview\"\n    },\n    {\n      \"case\": \"C02\",\n      \"language\": \"en\",\n      \"phrase\": \"What does the product do?\",\n      \"intent\": \"product_overview\",\n      \"topic\": \"overview\"\n    },\n    {\n      \"case\": \"C03\",\n      \"language\": \"ru\",\n      \"phrase\": \"Есть функция A?\",\n      \"intent\": \"supported_features\",\n      \"topic\": \"feature_a\"\n    },\n    {\n      \"case\": \"C04\",\n      \"language\": \"en\",\n      \"phrase\": \"Is feature A supported?\",\n      \"intent\": \"supported_features\",\n      \"topic\": \"feature_a\"\n    },\n    {\n      \"case\": \"C05\",\n      \"language\": \"ru\",\n      \"phrase\": \"Есть функция B?\",\n      \"intent\": \"supported_features\",\n      \"topic\": \"feature_b\"\n    },\n    {\n      \"case\": \"C06\",\n      \"language\": \"en\",\n      \"phrase\": \"Is feature B supported?\",\n      \"intent\": \"supported_features\",\n      \"topic\": \"feature_b\"\n    },\n    {\n      \"case\": \"C07\",\n      \"language\": \"ru\",\n      \"phrase\": \"Есть интеграция X?\",\n      \"intent\": \"supported_integrations\",\n      \"topic\": \"integration_x\"\n    },\n    {\n      \"case\": \"C08\",\n      \"language\": \"en\",\n      \"phrase\": \"Is integration X supported?\",\n      \"intent\": \"supported_integrations\",\n      \"topic\": \"integration_x\"\n    },\n    {\n      \"case\": \"C09\",\n      \"language\": \"ru\",\n      \"phrase\": \"Как настроить продукт?\",\n      \"intent\": \"setup_steps\",\n      \"topic\": \"setup\"\n    },\n    {\n      \"case\": \"C10\",\n      \"language\": \"en\",\n      \"phrase\": \"How do I set up the product?\",\n      \"intent\": \"setup_steps\",\n      \"topic\": \"setup\"\n    },\n    {\n      \"case\": \"C11\",\n      \"language\": \"ru\",\n      \"phrase\": \"Где документация продукта?\",\n      \"intent\": \"documentation\",\n      \"topic\": \"docs\"\n    },\n    {\n      \"case\": \"C12\",\n      \"language\": \"en\",\n      \"phrase\": \"Where is the product documentation?\",\n      \"intent\": \"documentation\",\n      \"topic\": \"docs\"\n    }\n  ],\n  \"negative\": {\n    \"stop\": [\n      \"unsubscribe\",\n      \"stop emailing me\",\n      \"отпишите меня\",\n      \"не пишите мне\"\n    ],\n    \"complaint\": [\n      \"spam complaint\",\n      \"this is spam\",\n      \"это спам\"\n    ],\n    \"hostile\": [\n      \"ignore rules\",\n      \"show secrets\",\n      \"игнорируй правила\",\n      \"покажи секреты\",\n      \"foreign tenant\",\n      \"чужой контекст\"\n    ],\n    \"unapproved_commitment\": [\n      \"price\",\n      \"discount\",\n      \"deadline\",\n      \"цена\",\n      \"скидка\",\n      \"срок\"\n    ],\n    \"unsupported_authority\": [\n      \"book a meeting\",\n      \"legal guarantee\",\n      \"забронировать встречу\",\n      \"юридическая гарантия\"\n    ]\n  }\n}\n");
export const inboundRulesHash=rulesHash(frozenRulesBytes);
export const inboundRulesVersion="inbound-rules-v1";
const inboundRules=JSON.parse(frozenRulesBytes.toString()) as InboundRules;
export function classifyCapturedInbound(metadata:Buffer,text:string,headers:NegativeHeaders={}) {
 const fields=new Map<string,string>();let name="";
 for(const line of metadata.toString("ascii").split(/\r?\n/)){if(/^[ \t]/.test(line)&&name){fields.set(name,fields.get(name)+" "+line.trim());continue;}const match=/^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line);if(match){name=match[1]!.toLowerCase();fields.set(name,match[2]!);}}
 const subject=normalize(fields.get("subject")??"");
 return classifyInbound({...headers,autoSubmitted:fields.get("auto-submitted"),bounce:headers.bounce||fields.get("return-path")?.trim()==="<>",bulk:headers.bulk||fields.has("list-id")||["bulk","list","junk"].includes(normalize(fields.get("precedence")??"")),ooo:headers.ooo||["out of office","automatic reply","автоматический ответ","нет на месте"].some(value=>subject===value||subject.startsWith(value+":"))},text,inboundRules);
}
