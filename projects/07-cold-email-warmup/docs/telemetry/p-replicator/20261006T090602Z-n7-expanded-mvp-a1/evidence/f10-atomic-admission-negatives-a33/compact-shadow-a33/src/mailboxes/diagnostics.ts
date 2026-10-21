import type { MailboxInput } from './input.js';
import { Budget, DiagnosticFailure, productionChannel, type Channel, type ChannelFactory, type FailureCode } from './diagnostic-channel.js';
export interface ProtocolResult {protocol:'smtp'|'imap';tls:'verified'|'failed'|'not_checked';auth:'success'|'failed'|'unsupported'|'not_checked';phase:'dns'|'tls'|'greeting'|'capability'|'auth'|'complete';code:FailureCode|null}
export interface DiagnosticResults {smtp:ProtocolResult;imap:ProtocolResult}
async function smtpReply(channel:Channel){
 const first=await channel.line();if(!/^\d{3}[ -]/.test(first))throw new DiagnosticFailure('protocol_invalid');
 const code=first.slice(0,3);const lines=[first.slice(4)];let line=first;
 while(line[3]==='-'){line=await channel.line();if(!line.startsWith(code)||!/[ -]/.test(line[3]!))throw new DiagnosticFailure('protocol_invalid');lines.push(line.slice(4));}
 return {code:Number(code),lines};
}
async function expect(channel:Channel,code:number){const r=await channel.budget.phase(()=>smtpReply(channel));if(r.code!==code)throw new DiagnosticFailure('protocol_invalid');return r.lines;}
async function smtp(channel:Channel,input:MailboxInput,result:ProtocolResult){
 await channel.open(input.smtpHost,input.smtpPort,new Map([[input.smtpHost,30]]));result.phase='tls';
 if(input.smtpPort===465){await channel.upgrade(input.smtpHost);result.tls='verified';}
 result.phase='greeting';await expect(channel,220);result.phase='capability';channel.write('EHLO n7.invalid');let capabilities=await expect(channel,250);
 if(input.smtpPort===587){
  if(!capabilities.some(l=>/^STARTTLS(?: |$)/i.test(l)))throw new DiagnosticFailure('tls_failed');
  channel.write('STARTTLS');await expect(channel,220);result.phase='tls';await channel.upgrade(input.smtpHost);result.tls='verified';
  result.phase='capability';channel.write('EHLO n7.invalid');capabilities=await expect(channel,250);
 }
 if(!capabilities.some(l=>/^AUTH(?:=| )/i.test(l)&&l.split(/[ =]+/).slice(1).some(s=>s.toUpperCase()==='PLAIN')))throw new DiagnosticFailure('auth_unsupported');
 result.phase='auth';await channel.budget.phase(async()=>{const encoded=Buffer.from('\0'+input.smtpUsername+'\0'+input.smtpPassword).toString('base64');channel.write('AUTH PLAIN '+encoded);
 let reply=await channel.budget.phase(()=>smtpReply(channel));if(reply.code===334){channel.write(encoded);reply=await channel.budget.phase(()=>smtpReply(channel));}
 if(reply.code!==235)throw new DiagnosticFailure(reply.code===535?'auth_rejected':'protocol_invalid');result.auth='success';result.phase='complete';});
}
function imapLine(line:string){if(/\{\d+\+?\}$/.test(line)||/^\* BYE/i.test(line))throw new DiagnosticFailure('protocol_invalid');return line;}
async function imap(channel:Channel,input:MailboxInput,result:ProtocolResult){
 await channel.open(input.imapHost,993,new Map([[input.imapHost,30]]));result.phase='tls';await channel.upgrade(input.imapHost);result.tls='verified';
 result.phase='greeting';const greeting=imapLine(await channel.line());if(/^\* PREAUTH/i.test(greeting))throw new DiagnosticFailure('auth_unsupported');if(!/^\* OK(?: |$)/i.test(greeting))throw new DiagnosticFailure('protocol_invalid');
 result.phase='capability';channel.write('a1 CAPABILITY');let plain=false;
 await channel.budget.phase(async()=>{for(;;){const line=imapLine(await channel.line());if(/^\* CAPABILITY /i.test(line)){plain=line.split(' ').some(s=>s.toUpperCase()==='AUTH=PLAIN');continue;}if(/^a1 OK(?: |$)/i.test(line))break;throw new DiagnosticFailure('protocol_invalid');}});
 if(!plain)throw new DiagnosticFailure('auth_unsupported');result.phase='auth';await channel.budget.phase(async()=>{channel.write('a2 AUTHENTICATE PLAIN');
 if(!/^\+(?: |$)/.test(imapLine(await channel.line())))throw new DiagnosticFailure('auth_rejected');
 channel.write(Buffer.from('\0'+input.imapUsername+'\0'+input.imapPassword).toString('base64'));
 const outcome=imapLine(await channel.line());if(!/^a2 OK(?: |$)/i.test(outcome))throw new DiagnosticFailure(/^a2 (?:NO|BAD)(?: |$)/i.test(outcome)?'auth_rejected':'protocol_invalid');result.auth='success';result.phase='complete';});
}
export async function diagnose(input:MailboxInput,allowlist:ReadonlyMap<string,number>,signal:AbortSignal,factory:ChannelFactory=productionChannel):Promise<DiagnosticResults>{
 const budget=new Budget(signal);
 const run=async(protocol:'smtp'|'imap'):Promise<ProtocolResult>=>{
  const result:ProtocolResult={protocol,tls:'not_checked',auth:'not_checked',phase:'dns',code:null};const channel=factory(budget);
  try{if(!allowlist.has(protocol==='smtp'?input.smtpHost:input.imapHost))throw new DiagnosticFailure('host_denied');await(protocol==='smtp'?smtp(channel,input,result):imap(channel,input,result));}
  catch(error){const code=error instanceof DiagnosticFailure?error.code:'connection_failed';result.code=code;if(result.phase==='tls')result.tls='failed';if(result.phase==='auth'||code==='auth_unsupported')result.auth=code==='auth_unsupported'?'unsupported':'failed';}
  finally{channel.close();}return result;
 };
 const [smtpResult,imapResult]=await Promise.all([run('smtp'),run('imap')]);return {smtp:smtpResult,imap:imapResult};
}
const active=new Set<string>();
export function admitDiagnostic(mailbox:string){if(active.size>=2||active.has(mailbox))throw new Error('diagnostic_busy');active.add(mailbox);let released=false;return()=>{if(!released){released=true;active.delete(mailbox);}};}
