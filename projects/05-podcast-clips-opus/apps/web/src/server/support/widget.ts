import { createHmac } from 'node:crypto';
import type { Pool } from '@clipmaker/db';
import type { WebConfig } from '@clipmaker/shared/config';
import { SupportError } from './boundary';
export async function widgetSession(pool:Pool,config:WebConfig['support'],sessionHash:string|null) {
  if(config.mode==='disabled')throw new SupportError('unavailable',503,'Поддержка пока недоступна');
  const settings={baseURL:config.baseURL,inboxID:config.inboxID,...(config.synthetic?{synthetic:true}:{})};
  if(config.identifiedEnabled&&sessionHash) {
    const account=(await pool.query<{id:string;email:string}>(`SELECT a.id,a.email FROM account a JOIN session s ON s.account_id=a.id
      WHERE s.cookie_token_hash=$1 AND a.status='active' AND a.email_verified_at IS NOT NULL
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()`,[sessionHash])).rows[0];
    if(account) {
      const now=Math.floor(Date.now()/1000),exp=now+60;
      const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({external_user_id:account.id,email:account.email,first_name:'Клиент',iat:now,exp});
      const jwt=unsigned+'.'+createHmac('sha256',config.secret!).update(unsigned).digest('base64url');
      return {mode:'verified' as const,...settings,jwt,expiresAt:new Date(exp*1000).toISOString()};
    }
  }
  return {mode:'anonymous' as const,...settings};
}
