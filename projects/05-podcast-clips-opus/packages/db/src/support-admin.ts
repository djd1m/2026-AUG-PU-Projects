import { transaction, type Pool, type PoolClient } from './index.js';
import { effectivePlanSql } from './plan.js';
import { readCreditBalance } from './credits.js';
export const SUPPORT_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class StaffNotFound extends Error {}
export async function supportOperator(tx:PoolClient,hash:string) {
  const hint=(await tx.query<{account_id:string}>('SELECT account_id FROM session WHERE cookie_token_hash=$1',[hash])).rows[0];
  if(!hint)throw new StaffNotFound();
  await tx.query('SELECT id FROM account WHERE id=$1 FOR SHARE',[hint.account_id]);
  await tx.query('SELECT id FROM session WHERE cookie_token_hash=$1 FOR SHARE',[hash]);
  await tx.query('SELECT id FROM support_operator WHERE account_id=$1 FOR SHARE',[hint.account_id]);
  const row=(await tx.query<{id:string}>(`SELECT a.id FROM account a JOIN session s ON s.account_id=a.id JOIN support_operator o ON o.account_id=a.id
    WHERE s.cookie_token_hash=$1 AND a.status='active' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND o.revoked_at IS NULL`,[hash])).rows[0];
  if(!row)throw new StaffNotFound();return row.id;
}
const projection=`a.id,a.email,a.status,a.email_verified_at IS NOT NULL AS verified,${effectivePlanSql('a')} AS plan`;
function decodeCursor(cursor?:string) {
  if(!cursor)return null;
  try {
    if(cursor.length>256 || !/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error();
    const value=JSON.parse(Buffer.from(cursor,'base64url').toString());
    if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!Number.isFinite(Date.parse(value[0]))||!SUPPORT_UUID.test(value[1]))throw new Error();
    return value as [string,string];
  }catch{throw new Error('invalid_cursor');}
}
export class SupportAdminStore {
  constructor(private readonly pool:Pool){}
  async authorize(hash:string) { return transaction(this.pool,tx=>supportOperator(tx,hash)); }
  async list(hash:string,cursor?:string,query?:string) {
    const after=decodeCursor(cursor);
    return transaction(this.pool,async tx=>{
      const actor=await supportOperator(tx,hash);
      const rows=(await tx.query<{id:string;cursor_at:string;email:string;status:string;verified:boolean;plan:string}>(`SELECT ${projection},a.created_at::text AS cursor_at FROM account a
        WHERE ($1::timestamptz IS NULL OR (a.created_at,a.id)<($1::timestamptz,$2::uuid))
        AND ($3::text IS NULL OR a.email=$3 OR a.id::text=$3) ORDER BY a.created_at DESC,a.id DESC LIMIT 25`,[after?.[0]??null,after?.[1]??null,query??null])).rows;
      await tx.query('INSERT INTO support_audit(actor,action) VALUES($1,$2)',[actor,query?'search':'list']);
      const last=rows.at(-1);
      return {items:rows.map(({cursor_at:_cursor,...row})=>row),nextCursor:rows.length===25&&last?Buffer.from(JSON.stringify([last.cursor_at,last.id])).toString('base64url'):null};
    });
  }
  async card(hash:string,id:string) {
    return transaction(this.pool,async tx=>{
      const actor=await supportOperator(tx,hash);
      const account=(await tx.query(`SELECT ${projection},a.created_at,a.billing_policy FROM account a WHERE a.id=$1`,[id])).rows[0];
      if(!account)throw new StaffNotFound();
      const now=(await tx.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0]!.now;
      const credits=await readCreditBalance(tx,id,now);
      const ledger=(await tx.query(`SELECT id,kind,delta,status,at,source,video_id FROM (
        SELECT g.id,'grant'::text AS kind,g.total_seconds AS delta,'granted'::text AS status,g.created_at AS at,
          g.source,NULL::uuid AS video_id FROM credit_grant g WHERE g.account_id=$1
        UNION ALL
        SELECT c.id,'charge'::text AS kind,CASE WHEN c.state='settled' THEN -c.billable_seconds ELSE 0 END AS delta,
          c.state AS status,COALESCE(c.finished_at,c.created_at) AS at,NULL::text AS source,v.id AS video_id
          FROM video_credit_charge c JOIN video v ON v.id=c.video_id WHERE v.account_id=$1
        ) history ORDER BY at DESC,id DESC LIMIT 20`,[id])).rows;
      const payments=(await tx.query('SELECT id,status,amount_minor FROM payment WHERE account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[id])).rows;
      const jobs=(await tx.query(`SELECT v.id,v.status,v.failure_reason AS "failureCode",
        (SELECT j.stage FROM job_attempt j WHERE j.video_id=v.id ORDER BY j.fence DESC,j.created_at DESC,j.id DESC LIMIT 1) AS stage,
        v.stage_progress,v.created_at,v.updated_at,v.finished_at
        FROM video v WHERE v.account_id=$1 ORDER BY v.created_at DESC,v.id DESC LIMIT 20`,[id])).rows;
      await tx.query("INSERT INTO support_audit(actor,target,action) VALUES($1,$2,'card')",[actor,id]);
      return {account,credits,ledger,payments,jobs};
    });
  }
}
export async function setSupportOperator(pool:Pool,input:{accountId:string;action:string;actor:string;reason:string}) {
  if(!SUPPORT_UUID.test(input.accountId)||!['grant','revoke'].includes(input.action)||!input.actor.trim()||input.actor.length>100||input.reason.trim().length<3||input.reason.length>500)throw new Error('invalid_arguments');
  return transaction(pool,async tx=>{
    const a=(await tx.query<{status:string;email_verified_at:Date|null}>('SELECT status,email_verified_at FROM account WHERE id=$1 FOR NO KEY UPDATE',[input.accountId])).rows[0];
    if(!a || (input.action==='grant'&&(a.status!=='active'||!a.email_verified_at)))return false;
    await tx.query('SELECT id FROM support_operator WHERE account_id=$1 FOR UPDATE',[input.accountId]);
    if(input.action==='grant') await tx.query(`INSERT INTO support_operator(account_id) VALUES($1)
      ON CONFLICT(account_id) DO UPDATE SET revoked_at=NULL`,[input.accountId]);
    else await tx.query('UPDATE support_operator SET revoked_at=clock_timestamp() WHERE account_id=$1',[input.accountId]);
    await tx.query('INSERT INTO support_audit(actor,target,action,reason) VALUES($1,$2,$3,$4)',[input.actor.trim(),input.accountId,input.action,input.reason.trim()]);
    return true;
  });
}
