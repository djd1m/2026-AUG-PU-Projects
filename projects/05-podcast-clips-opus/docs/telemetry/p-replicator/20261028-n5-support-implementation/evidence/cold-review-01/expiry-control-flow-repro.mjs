import assert from 'node:assert/strict';
const emailDigest = x=>x;
const transaction = async (pool, fn)=>fn(pool);
const methods={
  async sessions(tx, account, hashes) {
    const rows = (await tx.query(`SELECT cookie_token_hash FROM session WHERE account_id=$1
      AND cookie_token_hash=ANY($2::text[]) ORDER BY cookie_token_hash FOR UPDATE`,[account,[...new Set(hashes)].sort()])).rows;
    if (rows.length !== new Set(hashes).size) return false;
    return (await tx.query(`SELECT 1 FROM session WHERE account_id=$1 AND cookie_token_hash=ANY($2::text[])
      AND (revoked_at IS NOT NULL OR expires_at<=clock_timestamp())`,[account,hashes])).rowCount === 0;
  },
  async confirm(token, authority) {
    const hint=await this.peek(token,'verify');
    if (!hint || hint.account_id!==authority.accountId || !hint.issuing_session_hash) return false;
    return transaction(this.pool,async tx => {
      const account=await this.account(tx,hint.account_id);
      if (!account || account.status!=='active' || !await this.sessions(tx,account.id,[hint.issuing_session_hash,authority.sessionHash])) return false;
      await tx.query('SELECT id FROM support_email_token WHERE digest=$1 FOR UPDATE',[emailDigest(token)]);
      const used=await tx.query(`UPDATE support_email_token SET used_at=clock_timestamp() WHERE digest=$1 AND purpose='verify'
        AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,[emailDigest(token),account.id,account.email]);
      if (used.rowCount!==1) return false;
      await tx.query('UPDATE account SET email_verified_at=clock_timestamp() WHERE id=$1',[account.id]);
      return true;
    });
  }
};

let expired=false, checks=0;const trace=[];
const tx={async query(sql){
 trace.push(sql.trim().replace(/\s+/g,' '));
 if(sql.includes('SELECT cookie_token_hash'))return {rows:[{cookie_token_hash:'issuer'},{cookie_token_hash:'confirmer'}]};
 if(sql.includes('SELECT 1 FROM session')){checks++;return {rowCount:expired?1:0};}
 if(sql.includes('SELECT id FROM support_email_token')){expired=true;return {rows:[{id:'token'}]};}
 if(sql.includes('UPDATE support_email_token'))return {rowCount:1};
 return {rowCount:1};
}};
const store={...methods,pool:tx,peek:async()=>({account_id:'A',issuing_session_hash:'issuer'}),account:async()=>({id:'A',email:'a@example.test',status:'active'})};
const result=await store.confirm('synthetic',{accountId:'A',sessionHash:'confirmer'});
assert.equal(result,true);assert.equal(expired,true);assert.equal(checks,1);
console.log(JSON.stringify({result,sessionsExpiredAtTokenLock:expired,sessionExpiryChecks:checks,trace},null,2));
