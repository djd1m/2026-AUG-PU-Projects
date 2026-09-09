import { assert, object, safeTree, str, hash } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { emailInput, verifyPassword } from './password.mjs';
import { secret, tokenHash, originInput, live, emailLock, sessionAccount,
  currentSession, lockAccount, createAccount, revoke } from './access-helpers.mjs';

export function createOAuthAccess({pool,identity,yandex,now}) {
  async function passwordProof(plain,password) {
    const account=await sessionAccount(pool,identity,plain);
    await identity.limit(`access-password:${account.id}`);
    assert(account.password_hash!==null && await verifyPassword(account.password_hash,password),'LOGIN_FAILED',401,'Текущий пароль не подходит');
    return account;
  }
  async function start(plain,input,origin,peer) {
    safeTree(input);object(input,['intent','currentPassword'],['intent']);
    assert(['login','link'].includes(input.intent));originInput(origin);
    assert(yandex.configured,'YANDEX_UNCONFIGURED',503,'Вход через Яндекс не настроен');
    str(peer,200);await identity.limit(`oauth-start:${peer}`,30);
    const source=input.intent==='link'?await passwordProof(plain,input.currentPassword):null;
    if(source)assert(source.email_verified_at,'EMAIL_VERIFICATION_REQUIRED',403,'Сначала подтвердите почту');
    const state=secret(),browser=secret(),verifier=secret();
    await transaction(pool,async client=>{
      const account=source?await currentSession(client,identity,plain,source):null;
      if(account)assert(account.email_verified_at,'EMAIL_VERIFICATION_REQUIRED',403,'Сначала подтвердите почту');
      await client.query('SELECT pg_advisory_xact_lock(330810)');
      await client.query('DELETE FROM oauth_flows WHERE expires_at<=$1',[new Date(now())]);
      assert((await client.query('SELECT count(*)::int AS n FROM oauth_flows')).rows[0].n<10000,'ACCESS_CAPACITY',429,'Повторите позже');
      await client.query(`INSERT INTO oauth_flows(state_hash,browser_hash,verifier,origin,intent,account_id,version,session_hash,expires_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[tokenHash(state),tokenHash(browser),verifier,origin,input.intent,
        account?.id??null,account?.version??null,source?hash(plain):null,new Date(now()+600000),new Date(now())]);
      if(account)identity.fresh(account.expires_at);
    });
    return {url:yandex.authorizationUrl({state,verifier,redirectUri:`${origin}/api/account/yandex/callback`}),browser};
  }
  async function callback({state,browser,host,code,error,session}) {
    assert(yandex.configured,'YANDEX_UNCONFIGURED',503,'Вход через Яндекс не настроен');
    const digest=tokenHash(state),browserHash=tokenHash(browser);
    const flow=await transaction(pool,async client=>{
      const candidate=(await client.query('SELECT * FROM oauth_flows WHERE state_hash=$1 FOR UPDATE',[digest])).rows[0];
      live(candidate,now);originInput(candidate.origin);
      assert(candidate.browser_hash===browserHash && new URL(candidate.origin).host===host,'OAUTH_STATE',400,'Попытка входа недействительна');
      if(candidate.intent==='link')assert(typeof session==='string' && hash(session)===candidate.session_hash,'OAUTH_STATE',400,'Войдите заново перед привязкой');
      // A valid attempt is consumed even if provider denies or the exchange fails.
      await client.query('DELETE FROM oauth_flows WHERE state_hash=$1',[digest]);
      return candidate;
    });
    if(error)return {origin:flow.origin,error:'YANDEX_CANCELLED'};
    str(code,2048);
    const profile=await yandex.profile({code,verifier:flow.verifier,redirectUri:`${flow.origin}/api/account/yandex/callback`});
    str(profile.externalId,200);const email=emailInput(profile.email);
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(330807,hashtext($1))',[profile.externalId]);
      live(flow,now);
      const existing=(await client.query("SELECT account_id FROM sso_identities WHERE provider='yandex' AND external_id=$1",[profile.externalId])).rows[0];
      if(flow.intent==='link') {
        const account=await currentSession(client,identity,session,{id:flow.account_id,version:flow.version});
        assert(account.email_verified_at && account.password_hash!==null,'EMAIL_VERIFICATION_REQUIRED',403,'Подтвердите почту и текущий способ входа');
        assert(!existing || existing.account_id===account.id,'IDENTITY_BOUND',409,'Этот Яндекс ID уже связан с другим аккаунтом');
        const current=(await client.query("SELECT external_id FROM sso_identities WHERE account_id=$1 AND provider='yandex'",[account.id])).rows[0];
        assert(!current || current.external_id===profile.externalId,'IDENTITY_BOUND',409,'Сначала отвяжите прежний Яндекс ID');
        await client.query(`INSERT INTO sso_identities(provider,external_id,account_id,created_at) VALUES('yandex',$1,$2,$3)
          ON CONFLICT(provider,external_id) DO NOTHING`,[profile.externalId,account.id,new Date(now())]);
        identity.fresh(account.expires_at);live(flow,now);
        return {origin:flow.origin,linked:true};
      }
      let account;
      if(existing) {
        account=await lockAccount(client,existing.account_id);
        const current=(await client.query("SELECT account_id FROM sso_identities WHERE provider='yandex' AND external_id=$1 FOR SHARE",[profile.externalId])).rows[0];
        assert(current?.account_id===account.id,'IDENTITY_CHANGED',409,'Способ входа изменился. Начните вход заново.');
      } else {
        await emailLock(client,email);
        // Every occupied email refuses; passwordless accounts are not an exception.
        assert(!(await client.query('SELECT id FROM accounts WHERE email=$1',[email])).rowCount,'ACCOUNT_COLLISION',409,'Адрес уже используется. Войдите прежним способом и привяжите Яндекс ID в кабинете.');
        account=await createAccount(client,{email,name:'Моя организация'},now);
        await client.query("INSERT INTO sso_identities(provider,external_id,account_id,created_at) VALUES('yandex',$1,$2,$3)",[profile.externalId,account.id,new Date(now())]);
      }
      live(flow,now);
      const issued=await identity.issue(client,account);live(flow,now);
      return {origin:flow.origin,...issued};
    });
  }
  async function unlink(plain,input) {
    safeTree(input);object(input,['currentPassword'],['currentPassword']);
    const source=await passwordProof(plain,input.currentPassword);
    await transaction(pool,async client=>{
      const account=await currentSession(client,identity,plain,source);
      assert(account.password_hash!==null,'LAST_LOGIN_METHOD',409,'Сначала установите пароль');
      await client.query("DELETE FROM sso_identities WHERE account_id=$1 AND provider='yandex'",[account.id]);
      await client.query('UPDATE accounts SET version=version+1 WHERE id=$1',[account.id]);
      await revoke(client,account.id,new Date(now()));identity.fresh(account.expires_at);
    });
    return {unlinked:true,loginRequired:true};
  }
  return {start,callback,unlink};
}
