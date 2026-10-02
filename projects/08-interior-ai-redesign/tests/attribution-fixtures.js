import { randomUUID } from 'node:crypto';
// Injected in-memory query fixture exercises service workflows; it is not a PostgreSQL substitute.
export function attributionFixture() {
  const accounts=new Set(),partners=new Map(),preferences=new Map(),consents=new Map(),intents=new Map();
  let now=new Date('2026-10-02T00:00:00Z'),backup;
  const result=rows=>({rows,rowCount:rows.length});
  const client={release(){},async query(sql,v=[]) {
    const q=sql.replace(/\s+/g,' ').trim();
    if(q==='BEGIN'){backup=structuredClone({preferences,consents,intents});return result([]);}
    if(q==='COMMIT'){backup=null;return result([]);}
    if(q==='ROLLBACK'){for(const [map,key] of [[preferences,'preferences'],[consents,'consents'],[intents,'intents']]){map.clear();for(const [k,r]of backup[key])map.set(k,r);}backup=null;return result([]);}
    if(q==='SELECT clock_timestamp() AS now')return result([{now}]);
    if(q.startsWith('SELECT id FROM account'))return result(accounts.has(v[0])?[{id:v[0]}]:[]);
    if(q==='SELECT * FROM partner WHERE code=$1 AND active')return result([...partners.values()].filter(p=>p.code===v[0]&&p.active));
    if(q.startsWith('SELECT * FROM tracking_consent'))return result(consents.has(v[0])?[consents.get(v[0])]:[]);
    if(q.startsWith('SELECT a.*,p.code')) {
      const a=preferences.get(v[0]),p=partners.get(a?.partner_id);
      return result(a&&p?[{...a,code:p.code,active:p.active,partner_owner:p.account_id}]:[]);
    }
    if(q.startsWith('DELETE FROM attribution')){preferences.delete(v[0]);return result([]);}
    if(q.startsWith('INSERT INTO tracking_consent')){consents.set(v[0],{opted_in:v[1]});return result([]);}
    if(q.startsWith('INSERT INTO attribution')) {
      const a=q.includes("'cookie'")?{source:'cookie',cookie_consent_at:v[2],expires_at:v[3],cookie_hash:v[4]}:
        {source:'code',cookie_consent_at:null,expires_at:null,cookie_hash:null};
      preferences.set(v[0],{account_id:v[0],partner_id:v[1],...a});return result([]);
    }
    if(q.startsWith('SELECT * FROM payment_intent WHERE account_id'))return result([...intents.values()].filter(i=>i.account_id===v[0]&&i.idempotency_key===v[1]));
    if(q.startsWith('INSERT INTO payment_intent')) {
      const i={id:v[0],account_id:v[1],idempotency_key:v[2],request_hash:v[3],package:'ROOM20',amount_minor:90000,currency:'RUB',status:'created',provider_mode:v[4],partner_id:v[8]};
      intents.set(i.id,i);return result([i]);
    }
    throw new Error('Unexpected fixture query: '+q);
  }};
  return {pool:{connect:async()=>client,query:client.query.bind(client)},client,accounts,partners,preferences,consents,intents,
    account(){const id=randomUUID();accounts.add(id);return id;},
    partner(account_id,code='partner_'+randomUUID()){const p={id:randomUUID(),account_id,code,active:true};partners.set(p.id,p);return p;},
    advance(ms){now=new Date(now.getTime()+ms);}};
}
