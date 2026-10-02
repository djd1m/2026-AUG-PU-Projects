import { randomBytes,randomUUID } from 'node:crypto';
import { HttpError,requireUuid } from './boundaries.js';
export const CODE_PATTERN=/^[A-Za-z0-9_-]{8,128}$/;
export async function activePartner(client,accountId,code) {
  if(typeof code!=='string'||!CODE_PATTERN.test(code))throw new HttpError(422,'invalid_partner_code');
  const p=(await client.query('SELECT * FROM partner WHERE code=$1 AND active',[code])).rows[0];
  if(!p || !p.account_id || p.account_id===accountId)throw new HttpError(422,'invalid_partner_code');
  return p;
}
// Trusted server/operator service only. No HTTP registry endpoint or owner-update operation.
export function createPartners(pool) {
  return {
    async create(accountId,code=randomBytes(24).toString('base64url')) {
      requireUuid(accountId);
      if(typeof code!=='string'||!CODE_PATTERN.test(code))throw new HttpError(400,'invalid_partner_code');
      try {
        const p=(await pool.query(`INSERT INTO partner(id,account_id,code,active)
          VALUES($1,$2,$3,true) RETURNING id,code,active`,[randomUUID(),accountId,code])).rows[0];
        return p;
      }catch(e){if(e.code==='23505')throw new HttpError(409,'duplicate_partner_code');
        if(e.code==='23503')throw new HttpError(404,'not_found');throw e;}
    },
    async activate(id,active) {
      requireUuid(id);if(typeof active!=='boolean')throw new HttpError(400,'invalid_activation');
      if(!(await pool.query('UPDATE partner SET active=$2 WHERE id=$1 AND account_id IS NOT NULL',[id,active])).rowCount)throw new HttpError(404,'not_found');
      return {ok:true};
    },
    async aggregate(id) {
      requireUuid(id);
      if(!(await pool.query('SELECT id FROM partner WHERE id=$1 AND account_id IS NOT NULL',[id])).rowCount)throw new HttpError(404,'not_found');
      return (await pool.query(`SELECT count(DISTINCT f.account_id)::int AS first_conversions,
        COALESCE(sum(i.amount_minor),0)::bigint::text AS amount_minor, 'RUB' AS currency
        FROM first_conversion f JOIN account a ON a.id=f.account_id
        JOIN payment_intent i ON i.id=f.payment_intent_id
        JOIN partner p ON p.id=f.partner_id
        WHERE p.id=$1 AND p.active AND p.account_id IS NOT NULL AND p.account_id<>a.id
        AND f.valid AND NOT a.billing_hold AND a.first_paid_payment_id=i.id
        AND i.account_id=a.id AND i.partner_id=p.id AND i.status='succeeded'
        AND i.amount_minor=90000 AND i.currency='RUB' AND f.amount_minor=i.amount_minor AND f.currency=i.currency
        AND NOT EXISTS(SELECT 1 FROM verified_refund r WHERE r.payment_intent_id=i.id)
        AND EXISTS(SELECT 1 FROM provider_event e WHERE e.object_kind='payment'
          AND e.provider_object_id=i.provider_id AND e.event_type='payment.succeeded')
        AND EXISTS(SELECT 1 FROM credit_ledger l WHERE l.account_id=a.id AND l.kind='purchase' AND l.reference=i.id)`,[id])).rows[0];
    }
  };
}
