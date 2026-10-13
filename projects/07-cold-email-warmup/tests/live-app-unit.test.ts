import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
test('live billing config requires explicit price/key files/HTTPS and preserves disabled TEST independence',()=>{
 const directory=mkdtempSync(join(tmpdir(),'n7-live-config-'));const shop=join(directory,'shop'),key=join(directory,'key');
 try {
  writeFileSync(shop,'123');writeFileSync(key,'OFFLINE_CONFIG_PRIVATE_CANARY');
  const env={...process.env,BILLING_MODE:'live_provider',APP_ORIGIN:'https://cabinet.example',N7_TEAM_PRICE_MINOR:'25001',YOOKASSA_SHOP_ID_FILE:shop,YOOKASSA_SECRET_KEY_FILE:key};
  assert.deepEqual(loadConfig(env).liveBilling,{shopId:'123',secretKey:'OFFLINE_CONFIG_PRIVATE_CANARY',amountMinor:25001});
  for(const price of [undefined,'0','-1','1.1','01','2147483648','NaN'])assert.throws(()=>loadConfig({...env,N7_TEAM_PRICE_MINOR:price}),{message:'invalid_live_price'});
  for(const patch of [{YOOKASSA_SHOP_ID_FILE:undefined},{YOOKASSA_SECRET_KEY_FILE:undefined},{YOOKASSA_SECRET_KEY_FILE:join(directory,'missing')}])assert.throws(()=>loadConfig({...env,...patch}),{message:'invalid_live_provider_config'});
  assert.throws(()=>loadConfig({...env,APP_ORIGIN:'http://127.0.0.1'}),{message:'invalid_live_origin'});
  assert.throws(()=>loadConfig({...env,BILLING_MODE:'invented'}),{message:'invalid_billing_mode'});
  for(const mode of ['disabled','local_test'])assert.equal(loadConfig({...env,BILLING_MODE:mode,YOOKASSA_SHOP_ID_FILE:undefined,YOOKASSA_SECRET_KEY_FILE:undefined,N7_TEAM_PRICE_MINOR:undefined}).liveBilling,undefined);
 } finally {rmSync(directory,{recursive:true});}
});
