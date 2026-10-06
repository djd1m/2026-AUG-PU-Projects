import type { MailboxInput } from '../mailboxes/input.js';
import { TransportBudget,TransportChannel,TransportFailure,type TransportFixture } from '../mailboxes/transport-channel.js';
import type { LiveMessage } from './message.js';
export type SmtpOutcome={kind:'accepted';acceptedAt:Date}|{kind:'pre_data_transient';proof:'no_data_submitted'}|{kind:'permanent';proof:'no_data_submitted'}|{kind:'rejected_after_data'}|{kind:'ambiguous'};
class ReplyFailure extends Error {constructor(readonly code:number){super('smtp_rejected');}}
async function reply(channel:TransportChannel,limit=10000){
 const first=await channel.line(limit);if(!/^\d{3}[ -]/.test(first))throw new TransportFailure('protocol_invalid');const code=first.slice(0,3),lines=[first.slice(4)];let line=first;
 while(line[3]==='-'){line=await channel.line(limit);if(!line.startsWith(code)||!/[ -]/.test(line[3]!))throw new TransportFailure('protocol_invalid');lines.push(line.slice(4));}return {code:Number(code),lines};
}
async function expect(channel:TransportChannel,codes:number[]){const r=await reply(channel);if(!codes.includes(r.code)){if(r.code>=400&&r.code<=599)throw new ReplyFailure(r.code);throw new TransportFailure('protocol_invalid');}return r.lines;}
export async function submitSmtp(input:MailboxInput,message:LiveMessage,allowlist:ReadonlyMap<string,number>,signal:AbortSignal,fixture?:TransportFixture):Promise<SmtpOutcome>{
 const channel=new TransportChannel(new TransportBudget(signal,90000),65536,fixture);let bodyStarted=false;
 try{
  await channel.open(input.smtpHost,input.smtpPort,allowlist);if(input.smtpPort===465)await channel.upgrade(input.smtpHost);await expect(channel,[220]);
  await channel.command('EHLO '+message.sender.split('@')[1]);let capabilities=await expect(channel,[250]);
  if(input.smtpPort===587){if(!capabilities.some(l=>/^STARTTLS(?: |$)/i.test(l)))throw new TransportFailure('tls_failed');await channel.command('STARTTLS');await expect(channel,[220]);await channel.upgrade(input.smtpHost);await channel.command('EHLO '+message.sender.split('@')[1]);capabilities=await expect(channel,[250]);}
  if(!capabilities.some(l=>/^AUTH(?:=| )/i.test(l)&&l.split(/[ =]+/).slice(1).some(x=>x.toUpperCase()==='PLAIN')))throw new TransportFailure('protocol_invalid');
  const encoded=Buffer.from('\0'+input.smtpUsername+'\0'+input.smtpPassword).toString('base64');await channel.command('AUTH PLAIN '+encoded);let auth=await reply(channel);if(auth.code===334){await channel.command(encoded);auth=await reply(channel);}if(auth.code!==235)throw new TransportFailure('protocol_invalid');
  await channel.command('MAIL FROM:<'+message.sender+'>');await expect(channel,[250]);await channel.command('RCPT TO:<'+message.recipient+'>');await expect(channel,[250,251]);await channel.command('DATA');await expect(channel,[354]);
  bodyStarted=true;await channel.write(message.wire);const final=await channel.budget.phase(()=>reply(channel,30000),30000);
  if(final.code===250)return {kind:'accepted',acceptedAt:new Date()};if(final.code>=400&&final.code<=599)return {kind:'rejected_after_data'};return {kind:'ambiguous'};
 }catch(error){if(bodyStarted)return {kind:'ambiguous'};if(error instanceof ReplyFailure&&error.code<500||error instanceof TransportFailure&&['timeout','connection_failed','dns_unavailable'].includes(error.code))return {kind:'pre_data_transient',proof:'no_data_submitted'};return {kind:'permanent',proof:'no_data_submitted'};}
 finally{await channel.close();}
}
