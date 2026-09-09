// Adapted from project01 email/password-reset primitives. N3 proof consumption,
// account versions and verification policy are deliberately not donor SQL copies.
import { assert, object, safeTree, str } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { emailInput, hashPassword } from './password.mjs';
import { secret, tokenHash, originInput, live, emailLock, lockAccount, sessionAccount,
  currentSession, revoke, createAccount } from './access-helpers.mjs';

const accepted=()=>({accepted:true,message:'Запрос принят. Если адрес подходит для этого действия, ожидайте письмо. Доставка может задержаться; при необходимости повторите запрос позже.'});
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createEmailAccess({pool,identity,mail,now,admit}) {
  async function request(purpose,input,origin,peer,plain) {
    originInput(origin);safeTree(input);
    object(input,purpose==='register'?['email','name']:purpose==='contact'?[]:['email'],purpose==='register'?['email','name']:purpose==='contact'?[]:['email']);
    assert(mail.configured,'MAIL_UNCONFIGURED',503,'Почтовый сервис не настроен');
    const source=purpose==='contact'?await sessionAccount(pool,identity,plain):null;
    if(source)assert(source.password_hash===null,'USE_PASSWORD_RESET',409,'Для подтверждения почты задайте новый пароль по ссылке восстановления.');
    const email=source?.email??emailInput(input.email);
    if(purpose==='register')str(input.name,100);
    await admit(email,peer);
    const issued=await transaction(pool,async client=>{
      await emailLock(client,email);
      const account=source?await currentSession(client,identity,plain,source):
        (await client.query('SELECT * FROM accounts WHERE email=$1 FOR UPDATE',[email])).rows[0];
      if(purpose==='register' && account)return null;
      if(purpose==='reset' && (!account || (account.password_hash===null && !account.email_verified_at)))return null;
      if(source)assert(account.email===email && account.password_hash===null,'TOKEN_INVALID',400,'Запрос устарел');
      // Serialize global capacity after account locking. No external IO in here.
      await client.query('SELECT pg_advisory_xact_lock(330808)');
      await client.query('DELETE FROM email_flows WHERE expires_at<=$1 OR used_at IS NOT NULL',[new Date(now())]);
      const count=(await client.query('SELECT count(*)::int AS n FROM email_flows')).rows[0].n;
      const existing=(await client.query('SELECT email FROM email_flows WHERE email=$1 AND purpose=$2',[email,purpose])).rowCount;
      if(!existing && count>=10000)return null;
      const token=secret(),ttl=purpose==='reset'?3600000:86400000;
      await client.query(`INSERT INTO email_flows(email,purpose,token_hash,account_id,version,name,issued_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(email,purpose) DO UPDATE SET
        token_hash=EXCLUDED.token_hash,account_id=EXCLUDED.account_id,version=EXCLUDED.version,name=EXCLUDED.name,
        issued_at=EXCLUDED.issued_at,expires_at=EXCLUDED.expires_at,used_at=NULL`,
      [email,purpose,tokenHash(token),account?.id??null,account?.version??null,input.name??null,new Date(now()),new Date(now()+ttl)]);
      if(source)identity.fresh(account.expires_at);
      return token;
    });
    if(issued) {
      const link=`${origin}/account#access=${purpose}&token=${issued}`;
      const label=purpose==='register'?'Завершить регистрацию':purpose==='reset'?'Задать новый пароль':'Подтвердить почту';
      const duration=purpose==='reset'?'1 час':'24 часа';
      try {await mail.send({to:email,subject:`Круг — ${label.toLowerCase()}`,
        text:`${label}: ${link}\nСсылка действует ${duration}. Если вы не запрашивали это действие, проигнорируйте письмо.`,
        html:`<p>${label}</p><p><a href="${escape(link)}">${label}</a></p><p>Ссылка действует ${duration}. Если вы не запрашивали действие, проигнорируйте письмо.</p>`});}
      catch { /* Uniform result for known/unknown email; no recipient/token in logs. */ }
    }
    return accepted();
  }
  async function complete(purpose,input,plain) {
    safeTree(input);object(input,purpose==='contact'?['token']:['token','password'],purpose==='contact'?['token']:['token','password']);
    const digest=tokenHash(input.token);
    const candidate=(await pool.query('SELECT * FROM email_flows WHERE token_hash=$1 AND purpose=$2',[digest,purpose])).rows[0];
    live(candidate,now);
    const source=purpose==='contact'?await sessionAccount(pool,identity,plain):null;
    if(source)assert(candidate.account_id===source.id && candidate.version===source.version,'TOKEN_INVALID',400,'Ссылка недействительна');
    // Hash once before SQL; preflight avoids paying KDF for random token guesses.
    const passwordHash=purpose==='contact'?null:await hashPassword(input.password);
    return transaction(pool,async client=>{
      let account;
      if(purpose==='register') {
        await emailLock(client,candidate.email);
        assert(!(await client.query('SELECT id FROM accounts WHERE email=$1 FOR UPDATE',[candidate.email])).rowCount,
          'ACCOUNT_COLLISION',409,'Адрес уже используется. Войдите существующим способом.');
      } else account=source?await currentSession(client,identity,plain,source):await lockAccount(client,candidate.account_id);
      const flow=(await client.query('SELECT * FROM email_flows WHERE token_hash=$1 AND purpose=$2 FOR UPDATE',[digest,purpose])).rows[0];
      live(flow,now);
      assert(flow.email===candidate.email && flow.account_id===candidate.account_id && flow.version===candidate.version,'TOKEN_INVALID',400,'Ссылка устарела');
      if(account)assert(flow.account_id===account.id && flow.email===account.email && flow.version===account.version,'TOKEN_INVALID',400,'Ссылка устарела');
      const at=new Date(now());
      if(purpose==='register') {
        assert(flow.account_id===null && flow.version===null,'TOKEN_INVALID',400,'Ссылка недействительна');
        await createAccount(client,{email:flow.email,passwordHash,name:flow.name,verified:true},now);
      } else if(purpose==='reset') {
        assert(account.password_hash!==null || account.email_verified_at,'TOKEN_INVALID',400,'Ссылка недействительна');
        await client.query('UPDATE accounts SET password_hash=$2,email_verified_at=$3,version=version+1 WHERE id=$1',[account.id,passwordHash,at]);
        await revoke(client,account.id,at);
      } else {
        assert(account.password_hash===null,'TOKEN_INVALID',400,'Запрос устарел');
        await client.query('UPDATE accounts SET email_verified_at=$2 WHERE id=$1',[account.id,at]);
        identity.fresh(account.expires_at);
      }
      live(flow,now);
      await client.query('UPDATE email_flows SET used_at=$2 WHERE token_hash=$1',[digest,new Date(now())]);
      return {completed:true,...(purpose==='contact'?{emailVerified:true}:{loginRequired:true})};
    });
  }
  return {
    register:(input,origin,peer)=>request('register',input,origin,peer),
    forgot:(input,origin,peer)=>request('reset',input,origin,peer),
    contact:(plain,origin,peer)=>request('contact',{},origin,peer,plain),
    activate:input=>complete('register',input),reset:input=>complete('reset',input),
    verifyContact:(plain,input)=>complete('contact',input,plain),
  };
}
