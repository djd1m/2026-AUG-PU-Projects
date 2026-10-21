import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { billingTransaction } from '../billing/transaction.js';
export class PartnerStore {
 constructor(readonly pool:Pool) {}
 async create(tenant:string) {
  return billingTransaction(this.pool,async client=>{
   await client.query('INSERT INTO partner_code(tenant_id,code) VALUES($1,$2) ON CONFLICT(tenant_id) DO NOTHING',[tenant,randomBytes(18).toString('base64url')]);
   return (await client.query('SELECT code,active FROM partner_code WHERE tenant_id=$1',[tenant])).rows[0];
  });
 }
 async status(tenant:string,code?:string) {
  const row=(await this.pool.query('SELECT code,active FROM partner_code WHERE tenant_id=$1 AND ($2::text IS NULL OR code=$2)',[tenant,code??null])).rows[0];
  if(!row) throw new HttpError(404,'not_found');
  const count=Number((await this.pool.query('SELECT count(*) FROM partner_conversion WHERE partner_tenant=$1',[tenant])).rows[0].count);
  return {...row,conversions:count,label:'TEST',reward:null};
 }
 async setActive(tenant:string,input:Record<string,unknown>) {
  if(Object.keys(input).length!==1 || typeof input.active!=='boolean') throw new HttpError(400,'invalid_input');
  return billingTransaction(this.pool,async client=>{if(!(await client.query('UPDATE partner_code SET active=$2 WHERE tenant_id=$1',[tenant,input.active])).rowCount) throw new HttpError(404,'not_found');return {active:input.active};});
 }
 async landing(code:string) {
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(code)) throw new HttpError(400,'invalid_partner_code');
  const row=(await this.pool.query("SELECT p.active FROM partner_code p JOIN tenant t ON t.id=p.tenant_id WHERE p.code=$1 AND t.state='active'",[code])).rows[0];
  if(!row) throw new HttpError(400,'invalid_partner_code');if(!row.active) throw new HttpError(400,'inactive_partner_code');
 }
}
