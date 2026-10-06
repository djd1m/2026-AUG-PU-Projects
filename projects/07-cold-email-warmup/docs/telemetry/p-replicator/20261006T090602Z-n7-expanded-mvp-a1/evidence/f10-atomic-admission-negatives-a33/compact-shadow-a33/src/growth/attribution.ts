import { createHmac,timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { HttpError } from '../errors.js';
const CODE=/^[A-Za-z0-9_-]{16,64}$/;
export const REFERRAL_COOKIE='n7_referral';
const AGE=30*86400000;
function signature(payload:string,key:Buffer) {return createHmac('sha256',key).update('n7-referral-v1:').update(payload).digest('base64url');}
export function referralToken(code:string,key:Buffer,now=Date.now()) {const payload=Buffer.from(JSON.stringify({code,issued:now,expires:now+AGE})).toString('base64url');return payload+'.'+signature(payload,key);}
export function cookieCode(cookie:string|undefined,key:Buffer,now=Date.now()):{code?:string;reason:string} {
 const values=(cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(REFERRAL_COOKIE+'='));
 if(!values.length) return {reason:'cookie_absent'};
 if(values.length!==1) return {reason:'cookie_invalid'};
 const token=values[0]!.slice(REFERRAL_COOKIE.length+1);
 if(token.length>512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return {reason:'cookie_invalid'};
 const [payload,sig]=token.split('.');const expected=signature(payload!,key);
 if(!timingSafeEqual(Buffer.from(sig!),Buffer.from(expected))) return {reason:'cookie_invalid'};
 try {
  const value=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8'));
  if(!CODE.test(value.code) || !Number.isSafeInteger(value.issued) || !Number.isSafeInteger(value.expires) || value.expires-value.issued!==AGE || value.issued>now) return {reason:'cookie_invalid'};
  if(value.expires<=now) return {reason:'cookie_expired'};
  return {code:value.code,reason:'cookie_valid'};
 } catch {return {reason:'cookie_invalid'};}
}
export async function resolveAttribution(client:PoolClient,tenant:string,explicit:unknown,cookie:string|undefined,key:Buffer) {
 const selected=explicit!==undefined?{code:explicit,reason:'explicit'}:cookieCode(cookie,key);
 if(selected.code===undefined) return {partner:null,code:null,reason:selected.reason};
 if(typeof selected.code!=='string' || !CODE.test(selected.code)) throw new HttpError(400,'invalid_partner_code');
 const row=(await client.query('SELECT p.* FROM partner_code p JOIN tenant t ON t.id=p.tenant_id WHERE p.code=$1 AND t.state=\'active\'',[selected.code])).rows[0];
 if(!row) throw new HttpError(400,'invalid_partner_code');
 if(!row.active) throw new HttpError(400,'inactive_partner_code');
 if(row.tenant_id===tenant) throw new HttpError(400,'self_referral');
 return {partner:row.tenant_id as string,code:selected.code,reason:selected.reason};
}
export function referralCookie(token:string,secure:boolean) {return `${REFERRAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`;}
