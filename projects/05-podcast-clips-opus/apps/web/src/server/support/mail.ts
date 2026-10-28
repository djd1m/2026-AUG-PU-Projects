import nodemailer from 'nodemailer';
import { createConnection, type Socket } from 'node:net';
import type { WebConfig } from '@clipmaker/shared/config';
export type MailConfig=WebConfig['mail'];
export interface SupportMessage { to:string; url:string; purpose:'verify'|'reset' }
export interface MailTransport { sendMail(message:object):Promise<unknown>; close():void }
// Public getSocket hook retains cancellation ownership; Nodemailer still handles TLS and SMTP.
// Nonpooled transporter.close() alone only releases auth listeners, not an active socket.
export function createSMTPTransport(options:object):MailTransport {
  const {host,port}=options as {host:string;port:number};
  let socket:Socket|undefined;
  const transport=nodemailer.createTransport({...options,getSocket:(_options:object,callback:(error:Error|null,value?:object)=>void)=>{
    socket=createConnection({host,port});
    const failed=(error:Error)=>callback(error);
    socket.once('error',failed);
    socket.once('connect',()=>{socket!.removeListener('error',failed);callback(null,{connection:socket});});
  }});
  return {sendMail:message=>transport.sendMail(message),close:()=>{socket?.destroy();transport.close();}};
}
const mailGlobal=globalThis as typeof globalThis & {n5SupportMailBudget?:{active:number}};
export class SupportMailer {
  private readonly budget=mailGlobal.n5SupportMailBudget??= {active:0};
  constructor(private readonly config:MailConfig, private readonly capture?:(message:SupportMessage)=>Promise<void>,
    private readonly factory:(options:object)=>MailTransport=createSMTPTransport) {}
  async send(message:SupportMessage):Promise<'accepted'|'failed'|'unknown'> {
    if(this.config.mode==='disabled'||this.budget.active>=4) return 'failed';
    if(this.config.mode==='test') {if(!this.capture) return 'failed';await this.capture(message);return 'accepted';}
    this.budget.active++;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let transport:MailTransport|undefined;
    try {
      const c=this.config;
      transport=this.factory({host:c.host,port:c.port,secure:c.secure,requireTLS:true,auth:{user:c.user,pass:c.password},
        connectionTimeout:8000,greetingTimeout:8000,socketTimeout:8000,dnsTimeout:8000,
        disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false,pool:false});
      const subject=message.purpose==='verify'?'Подтвердите почту КлипМейкер':'Восстановление пароля КлипМейкер';
      const escaped=message.url.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      return await Promise.race([
        transport.sendMail({from:c.from,to:message.to,subject,text:`${subject}\n${message.url}\nЕсли вы не запрашивали письмо, проигнорируйте его.`,
          html:`<p>${subject}</p><p><a href="${escaped}">Продолжить</a></p><p>Если вы не запрашивали письмо, проигнорируйте его.</p>`,
          disableFileAccess:true,disableUrlAccess:true}).then(()=> 'accepted' as const,()=> 'unknown' as const),
        new Promise<'unknown'>(resolve=>{timer=setTimeout(()=>{transport?.close();resolve('unknown');},8000);}),
      ]);
    } catch {return 'failed';}
    finally {if(timer)clearTimeout(timer);transport?.close();this.budget.active--;}
  }
}
