import { HttpError } from '../errors.js';
import { normalizeHost } from './network.js';
import type { ConnectionSettings, Credentials } from './provider.js';
export interface MailboxInput extends ConnectionSettings, Credentials { label:string; senderAddress:string; dailyLimit:number }
export function boundedText(value:unknown,max:number):string {
  if(typeof value!=='string' || !value.length || value.length>max || /[\r\n\0]/.test(value)) throw new HttpError(400,'invalid_input');
  return value;
}
export function email(value:unknown):string {
  const text=boundedText(value,254).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new HttpError(400,'invalid_input'); return text;
}
export function dailyLimit(value:unknown):number {
  if(!Number.isInteger(value) || (value as number)<1 || (value as number)>30) throw new HttpError(400,'invalid_limit'); return value as number;
}
export function parseMailbox(value:Record<string,unknown>):MailboxInput {
  if(value.smtpPort!==465 && value.smtpPort!==587 || value.imapPort!==993 || value.requiredTLS!==true) throw new HttpError(400,'tls_required');
  return {label:boundedText(value.label,120),senderAddress:email(value.senderAddress),smtpHost:normalizeHost(value.smtpHost),smtpPort:value.smtpPort,
    imapHost:normalizeHost(value.imapHost),imapPort:993,smtpUsername:boundedText(value.smtpUsername,512),smtpPassword:boundedText(value.smtpPassword,4096),
    imapUsername:boundedText(value.imapUsername,512),imapPassword:boundedText(value.imapPassword,4096),dailyLimit:value.dailyLimit===undefined?10:dailyLimit(value.dailyLimit)};
}
export function maskEmail(value:string) { return '***@'+value.split('@')[1]; }
