import { assert } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { createResend } from './providers/resend.mjs';
import { createYandex } from './providers/yandex.mjs';
import { createAccessAdmission } from './access-helpers.mjs';
import { createEmailAccess } from './email-access.mjs';
import { createOAuthAccess } from './oauth-access.mjs';

export async function createAccess({pool,identity,now,config={},fetchImpl}) {
  const mail=createResend({config:config.mail??{enabled:false},fetchImpl});
  const yandex=createYandex({config:config.yandex??{enabled:false},fetchImpl});
  assert(config.verificationRequired===undefined || typeof config.verificationRequired==='boolean','ACCESS_CONFIG_INVALID',503,'Некорректная настройка доступа');
  if(config.verificationRequired) {
    assert(mail.configured,'MAIL_UNCONFIGURED',503,'Для включения проверки почты настройте отправку писем');
    await pool.query('UPDATE access_policy SET verification_required=true WHERE id=1');
  }
  const email=createEmailAccess({pool,identity,mail,now,admit:createAccessAdmission(pool,now)});
  const oauth=createOAuthAccess({pool,identity,yandex,now});
  return {...email,oauth,status:()=>transaction(pool,async client=>({mailConfigured:mail.configured,yandexConfigured:yandex.configured,verificationRequired:await identity.verificationRequired(client)}))};
}
