import { randomUUID } from 'node:crypto';
import { HttpError } from './boundaries.js';
export function createFixtureProvider(pool,config) {
  if(config.providerMode!=='fixture'||!['test','development'].includes(config.runtime))throw new Error('Explicit nonproduction fixture required');
  const get=async(kind,id)=>{const row=(await pool.query('SELECT body FROM payment_fixture_object WHERE kind=$1 AND id=$2',[kind,id])).rows[0];
    if(!row)throw new HttpError(503,'fixture_object_missing');return row.body;};
  return {
    async create(body,key) {
      const b=JSON.parse(body),id=randomUUID();
      const p={id,status:'pending',paid:false,amount:b.amount,recipient:{account_id:'fixture'},metadata:b.metadata,
        confirmation:{type:'redirect',confirmation_url:config.origin+'/'}};
      await pool.query(`INSERT INTO payment_fixture_object(kind,id,body,provider_key) VALUES('payment',$1,$2,$3)
        ON CONFLICT(provider_key) DO NOTHING`,[id,JSON.stringify(p),key]);
      return (await pool.query('SELECT body FROM payment_fixture_object WHERE provider_key=$1',[key])).rows[0].body;
    },payment:id=>get('payment',id),refund:id=>get('refund',id)
  };
}
