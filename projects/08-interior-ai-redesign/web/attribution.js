import { createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { transaction } from './db.js';
import { HttpError,requireUuid } from './boundaries.js';
import { activePartner,CODE_PATTERN } from './partners.js';
export const TRACKING_TTL=30*24*60*60;
export const TRACKING_COOKIE='roomkind_attribution';
export function trackingCookie(token,secure,clear=false) {
  return `${TRACKING_COOKIE}=${clear?'':token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:TRACKING_TTL}${secure?'; Secure':''}`;
}
export function trackingToken(header) {
  if(typeof header!=='string')return null;
  const entries=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(TRACKING_COOKIE+'='));
  return entries.length===1 && /^[A-Za-z0-9_-]{43}$/.test(entries[0].slice(TRACKING_COOKIE.length+1))?entries[0].slice(TRACKING_COOKIE.length+1):null;
}
export function trackingHash(token,secret,accountId) {
  if(!secret)throw new HttpError(503,'attribution_unavailable');
  return createHmac('sha256',secret).update('attribution:'+accountId+':'+token).digest('hex');
}
export function validCookiePreference(row,consent,accountId,header,secret,now) {
  if(consent?.opted_in!==true)return false;
  const token=trackingToken(header);
  if(!token||!row.cookie_hash||!row.cookie_consent_at||!(new Date(row.expires_at)>now))return false;
  const proof=trackingHash(token,secret,accountId),stored=Buffer.from(row.cookie_hash,'hex'),actual=Buffer.from(proof,'hex');
  return stored.length===actual.length&&timingSafeEqual(stored,actual);
}
export function attributionInput(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','partner_code'].includes(k))||
    !['accept','deny','capture','manual','clear'].includes(body.action)||
    (body.partner_code!==undefined&&(typeof body.partner_code!=='string'||!CODE_PATTERN.test(body.partner_code)))||
    (['capture','manual'].includes(body.action)&&body.partner_code===undefined)||
    (['deny','clear'].includes(body.action)&&body.partner_code!==undefined))throw new HttpError(400,'invalid_attribution');
  return body;
}
export function createAttribution(pool,config) {
  async function stored(client,accountId,header) {
    const consent=(await client.query('SELECT * FROM tracking_consent WHERE account_id=$1',[accountId])).rows[0];
    let row=(await client.query(`SELECT a.*,p.code,p.active,p.account_id AS partner_owner FROM attribution a
      JOIN partner p ON p.id=a.partner_id WHERE a.account_id=$1`,[accountId])).rows[0];
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    let clear=false;
    if(row&&(!row.active||!row.partner_owner||row.partner_owner===accountId||
      (row.source==='cookie'&&!validCookiePreference(row,consent,accountId,header,config.secret,now)))) {
      clear=row.source==='cookie';await client.query('DELETE FROM attribution WHERE account_id=$1',[accountId]);row=null;
    }
    if(!row&&trackingToken(header))clear=true;
    return {row,consent,now,clear};
  }
  const view=s=>({tracking_opt_in:s.consent?.opted_in===true,source:s.row?.source??null,
    partner_code:s.row?.code??null,expires_at:s.row?.source==='cookie'?s.row.expires_at:null});
  async function locked(accountId,action) {
    requireUuid(accountId);return transaction(pool,async c=>{
      if(!(await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId])).rowCount)throw new HttpError(404,'not_found');
      return action(c);
    });
  }
  return {
    async state(accountId,header) {
      return locked(accountId,async c=>{const s=await stored(c,accountId,header);return {state:view(s),setCookie:s.clear?trackingCookie('',config.secureCookie,true):null};});
    },
    async update(accountId,body,header) {
      const b=attributionInput(body);
      return locked(accountId,async c=>{
        // Validate a supplied code before any mutation; invalid input has zero preference effects.
        const p=b.partner_code===undefined?null:await activePartner(c,accountId,b.partner_code);
        const s=await stored(c,accountId,header);let setCookie=s.clear?trackingCookie('',config.secureCookie,true):null;
        if(['deny','clear'].includes(b.action)) {
          await c.query('DELETE FROM attribution WHERE account_id=$1',[accountId]);s.row=null;
          setCookie=trackingCookie('',config.secureCookie,true);
        }
        if(['accept','deny'].includes(b.action)) {
          const opted=b.action==='accept';await c.query(`INSERT INTO tracking_consent(account_id,opted_in,changed_at)
            VALUES($1,$2,clock_timestamp()) ON CONFLICT(account_id) DO UPDATE SET opted_in=$2,changed_at=clock_timestamp()`,[accountId,opted]);
          s.consent={opted_in:opted};
        }
        if(b.action==='manual') {
          await c.query(`INSERT INTO attribution(account_id,partner_id,source) VALUES($1,$2,'code')
            ON CONFLICT(account_id) DO UPDATE SET partner_id=$2,source='code',cookie_consent_at=NULL,expires_at=NULL,cookie_hash=NULL`,[accountId,p.id]);
          s.row={source:'code',code:p.code,partner_id:p.id};
          if(s.clear||trackingToken(header))setCookie=trackingCookie('',config.secureCookie,true);
        }else if(p&&['accept','capture'].includes(b.action)) {
          if(s.consent?.opted_in!==true)throw new HttpError(403,'tracking_consent_required');
          if(!s.row) {
            const token=randomBytes(32).toString('base64url'),expires=new Date(s.now.getTime()+TRACKING_TTL*1000);
            await c.query(`INSERT INTO attribution(account_id,partner_id,source,cookie_consent_at,expires_at,cookie_hash)
              VALUES($1,$2,'cookie',$3,$4,$5)`,[accountId,p.id,s.now,expires,trackingHash(token,config.secret,accountId)]);
            s.row={source:'cookie',code:p.code,partner_id:p.id,expires_at:expires};setCookie=trackingCookie(token,config.secureCookie);
          }
        }
        return {state:view(s),setCookie};
      });
    },
    // Caller already owns account lock and transaction. Never nest a pool transaction here.
    async resolve(client,accountId,code,header) {
      if(code!==undefined) {
        const p=await activePartner(client,accountId,code);
        await client.query(`INSERT INTO attribution(account_id,partner_id,source) VALUES($1,$2,'code')
          ON CONFLICT(account_id) DO UPDATE SET partner_id=$2,source='code',cookie_consent_at=NULL,expires_at=NULL,cookie_hash=NULL`,[accountId,p.id]);
        return {partnerId:p.id,clearCookie:!!trackingToken(header)};
      }
      const s=await stored(client,accountId,header);return {partnerId:s.row?.partner_id??null,clearCookie:s.clear};
    }
  };
}
