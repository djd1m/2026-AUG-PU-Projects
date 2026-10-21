import { createHash } from 'node:crypto';
import { HttpError } from '../errors.js';
import { email } from '../mailboxes/input.js';
export const PERSONALIZATION_KEYS=['firstName','lastName','company'] as const;
export interface Step { subject:string; body:string; delayHours:number }
export interface Recipient { address:string; fields:Record<string,string> }
const invalid=()=>new HttpError(400,'invalid_campaign');
function text(value:unknown,subject=false):string {
  if(typeof value!=='string' || !value.length || value.length>(subject?200:20000) || /\0/.test(value) || (subject && /[\r\n]/.test(value))) throw invalid();
  return value;
}
function template(value:unknown,subject=false) {
  const result=text(value,subject);
  if(/[<>]|javascript:|\bon\w+\s*=/i.test(result)) throw invalid();
  const stripped=result.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g,(_match,key:string)=>{
    if(!PERSONALIZATION_KEYS.includes(key as typeof PERSONALIZATION_KEYS[number])) throw invalid(); return '';
  });
  if(/[{}]/.test(stripped)) throw invalid(); return result;
}
export function render(step:Step,fields:Record<string,string>) {
  const replace=(source:string)=>source.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g,(_match,key:string)=>{
    if(typeof fields[key]!=='string' || !fields[key]) throw new HttpError(400,'missing_field'); return fields[key];
  });
  const subject=replace(step.subject); if(/[\r\n]/.test(subject)) throw invalid();
  const body=replace(step.body);
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return {subject,body,html:`<h2>${escape(subject)}</h2><pre>${escape(body)}</pre>`};
}
export function parseCampaign(raw:Record<string,unknown>) {
  if(!Array.isArray(raw.recipients) || !raw.recipients.length || raw.recipients.length>100) throw invalid();
  const contacts:Recipient[]=raw.recipients.map((item:unknown)=>{
    const row=typeof item==='string'?{address:item,fields:{}}:item as Recipient;
    if(!row || typeof row!=='object') throw invalid();
    const address=email(row.address); if(/[,:;<>"'\\]/.test(address)) throw invalid();
    const fields=row.fields??{};
    if(!fields || typeof fields!=='object' || Array.isArray(fields)) throw invalid();
    for(const [key,value] of Object.entries(fields)) if(!PERSONALIZATION_KEYS.includes(key as typeof PERSONALIZATION_KEYS[number]) || typeof value!=='string' || value.length>500 || /\0/.test(value)) throw invalid();
    return {address,fields};
  });
  if(new Set(contacts.map(r=>r.address)).size!==contacts.length) throw invalid();
  const source=raw.steps??[{subject:'N7 campaign',body:raw.content,delayHours:24}];
  if(!Array.isArray(source) || !source.length || source.length>5) throw invalid();
  const steps:Step[]=source.map((row:Record<string,unknown>)=>{
    if(!row || typeof row!=='object' || typeof row.delayHours!=='number' || !Number.isFinite(row.delayHours) || row.delayHours<24 || row.delayHours>8760) throw invalid();
    return {subject:template(row.subject,true),body:template(row.body),delayHours:row.delayHours};
  });
  for(const step of steps) for(const recipient of contacts) render(step,recipient.fields);
  const recipients=contacts.map(r=>r.address).sort();
  const personalization=Object.fromEntries(contacts.map(r=>[r.address,r.fields]));
  const content=raw.steps===undefined?text(raw.content):JSON.stringify(steps);
  return {content,steps,recipients,personalization,fingerprint:createHash('sha256').update(JSON.stringify(recipients)).digest('hex')};
}
