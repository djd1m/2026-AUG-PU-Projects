import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { after } from 'next/server';
import { z } from 'zod';
import { SupportAdminStore, SupportEmailStore, StaffNotFound, SUPPORT_UUID } from '@clipmaker/db';
import { getRuntime } from '../runtime';
import { readSessionCookie } from '../auth-handler';
import { allowMutation,allowRead } from '../rate-limit';
import { clientIp } from '../ip';
import { createEmailHandler } from './email-handler';
import { SupportMailer } from './mail';
import { supportBody,supportFailure,supportJSON,SupportError } from './boundary';
import { widgetSession } from './widget';
import { supportContext } from './context';
let mailer:SupportMailer|undefined;
export function emailRoute(action:'send'|'confirm'|'forgot'|'reset') {
  return async(request:Request)=>{
    const r=getRuntime();
    mailer??=new SupportMailer(r.config.mail,r.config.mail.mode==='test'?async message=>{
      const destination=process.env.N5_MAIL_TEST_CAPTURE_FILE;
      if(!destination || !destination.startsWith('/tmp/'))throw new Error('test_capture_missing');
      const file=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW,0o600);
      try {await file.chmod(0o600);await file.writeFile(JSON.stringify(message)+'\n');}finally{await file.close();}
    }:undefined);
    return createEmailHandler(action,{auth:r.auth,store:new SupportEmailStore(r.pool),mailer,mailAvailable:r.config.mail.mode!=='disabled',
      publicOrigin:r.config.publicOrigin,trustedProxyHops:r.config.trustedProxyHops,secret:r.config.sessionSecret,
      allowIP:ip=>allowMutation(r.redis,ip,r.config.sessionSecret),after:task=>after(task)})(request);
  };
}
const uuid=z.string().regex(SUPPORT_UUID);
export function supportRoute(action:'session'|'context') {
  return async(request:Request)=>{
    try {
      const r=getRuntime();
      const {body}=await supportBody(request,action==='session'?z.object({}).strict():z.object({videoId:uuid.optional()}).strict(),{
        publicOrigin:r.config.publicOrigin,trustedProxyHops:r.config.trustedProxyHops,allowIP:ip=>allowMutation(r.redis,ip,r.config.sessionSecret)});
      if(r.config.support.mode==='disabled')throw new SupportError('unavailable',503,'Поддержка пока недоступна');
      const cookie=readSessionCookie(request),hash=cookie?r.auth.tokenHash(cookie):null;
      return supportJSON(action==='session'?await widgetSession(r.pool,r.config.support,hash):await supportContext(r.pool,hash,'videoId' in body && typeof body.videoId==='string'?body.videoId:undefined));
    }catch(error){return supportFailure(error);}
  };
}
export function staffRoute(action:'list'|'search'|'card') {
  return async(request:Request,context?:{params:Promise<{accountId:string}>})=>{
    try {
      const r=getRuntime();const cookie=readSessionCookie(request);
      const hash=cookie?r.auth.tokenHash(cookie):'',store=new SupportAdminStore(r.pool);
      if(action==='search') {
        const {body}=await supportBody(request,z.object({query:z.string().trim().min(1).max(254).refine(v=>SUPPORT_UUID.test(v)||z.string().email().safeParse(v).success).transform(v=>v.toLowerCase()),cursor:z.string().max(256).optional()}).strict(),{
          publicOrigin:r.config.publicOrigin,trustedProxyHops:r.config.trustedProxyHops,allowIP:async ip=>{
            if(!await allowMutation(r.redis,ip,r.config.sessionSecret))return false;
            await store.authorize(hash);return true;}});
        return supportJSON(await store.list(hash,body.cursor,body.query));
      }
      if(!await allowRead(r.redis,clientIp(request.headers,r.config.trustedProxyHops),r.config.sessionSecret))throw new SupportError('rate_limited',429);
      await store.authorize(hash);
      if(action==='card') {
        const id=(await context!.params).accountId;if(!SUPPORT_UUID.test(id))throw new StaffNotFound();
        return supportJSON(await store.card(hash,id));
      }
      const url=new URL(request.url);
      if([...url.searchParams.keys()].some(key=>key!=='cursor'))throw new SupportError('invalid',422);
      return supportJSON(await store.list(hash,url.searchParams.get('cursor')??undefined));
    }catch(error){
      if(error instanceof StaffNotFound)return supportFailure(new SupportError('not_found',404,'Не найдено'));
      if(error instanceof Error && error.message==='invalid_cursor')return supportFailure(new SupportError('invalid',422));
      return supportFailure(error);
    }
  };
}
