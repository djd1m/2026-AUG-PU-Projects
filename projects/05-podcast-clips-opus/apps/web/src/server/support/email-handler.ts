import { createHmac } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { SupportEmailStore } from '@clipmaker/db';
import { BCRYPT_COST, type AuthService } from '../auth';
import { readSessionCookie } from '../auth-handler';
import { ipPrefix } from '../ip';
import { supportBody,supportJSON,supportFailure,SupportError } from './boundary';
import type { SupportMailer } from './mail';
const token=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const schemas={send:z.object({}).strict(),confirm:z.object({token}).strict(),
  forgot:z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase())}).strict(),
  reset:z.object({token,password:z.string().min(8).refine(v=>Buffer.byteLength(v)<=72)}).strict()};
export interface EmailDeps {auth:AuthService;store:SupportEmailStore;mailer:SupportMailer;mailAvailable:boolean;
  publicOrigin:string;trustedProxyHops:number;secret:string;allowIP:(ip:string)=>Promise<boolean>;after:(task:()=>Promise<void>)=>void}
export function createEmailHandler(action:keyof typeof schemas,deps:EmailDeps) {
  return async(request:Request)=>{
    try {
      const {body,ip}=await supportBody(request,schemas[action] as z.ZodType<Record<string,string>>,deps);
      if(!deps.mailAvailable)throw new SupportError('unavailable',503,'Отправка писем пока недоступна');
      const cookie=readSessionCookie(request);
      const session=cookie?await deps.auth.authenticate(cookie):null;
      const authority=session&&cookie?{accountId:session.account_id,sessionHash:deps.auth.tokenHash(cookie)}:undefined;
      if(action==='confirm'||action==='send') {
        if(!authority)throw new SupportError('unauthorized',401,'Войдите в аккаунт');
        if(action==='confirm') {
          if(!await deps.store.confirm(body.token!,authority))throw new SupportError('invalid_token',422,'Ссылка недействительна');
          return supportJSON({ok:true,verified:true});
        }
      }
      if(action==='reset') {
        if(!await deps.store.peek(body.token!,'reset'))throw new SupportError('invalid_token',422,'Ссылка недействительна');
        const hash=await bcrypt.hash(body.password!,BCRYPT_COST);
        if(!await deps.store.reset(body.token!,hash))throw new SupportError('invalid_token',422,'Ссылка недействительна');
        return supportJSON({ok:true,loginRequired:true});
      }
      const hash=(value:string)=>createHmac('sha256',deps.secret).update(value).digest('hex');
      const destination=action==='send'?await deps.store.currentEmail(authority!.accountId):body.email;
      if(!destination)throw new SupportError('unauthorized',401,'Войдите в аккаунт');
      let issued:Awaited<ReturnType<SupportEmailStore['issue']>>=null;
      try {issued=await deps.store.issue(action==='send'?'verify':'reset',destination,hash(ipPrefix(ip)),hash(destination),action==='send'?authority:undefined);}
      catch {if(action!=='forgot')throw new SupportError('unavailable',503);}
      const deliver=async()=>{
        if(!issued)return;
        const url=new URL(action==='send'?'/verify-email':'/reset',deps.publicOrigin);url.hash=`token=${issued.token}`;
        const state=await deps.mailer.send({to:issued.email,url:url.toString(),purpose:action==='send'?'verify':'reset'});
        await deps.store.delivery(issued.id,state);
        return state;
      };
      if(action==='forgot') {
        if(issued) {try{deps.after(async()=>{try{await deliver();}catch{/* Best effort; never log token/address. */}});}catch{/* Same response if lifecycle scheduling fails. */}}
        return supportJSON({ok:true,message:'Если адрес зарегистрирован, инструкция будет отправлена. Доставка не гарантирована.'},202);
      }
      if(!issued)throw new SupportError('unavailable',503,'Письмо пока не отправлено. Повторите позже');
      if(await deliver()!=='accepted')throw new SupportError('unavailable',503,'Отправку не удалось подтвердить. Проверьте почту или повторите позже');
      return supportJSON({ok:true},202);
    } catch(error){return supportFailure(error);}
  };
}
