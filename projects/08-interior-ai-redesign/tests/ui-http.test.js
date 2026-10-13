import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createApp} from '../web/app.js';
import {readConfig} from '../web/config.js';
import {fixtureConfig,ownedPool} from '../scripts/ui/fixture-driver.js';
test('actual static handler allowlists modules and denies private/source traversal',async()=>{
  const handler=createApp({query:async()=>({rows:[]})},{secret:'test',storageDir:'/tmp/n8-ui-static',origin:'http://localhost',runtime:'test',providerMode:'disabled',platformDailyLimit:200,accountDailyLimit:20}).listeners('request')[0];
  async function get(path) {
    const req=Readable.from([]);Object.assign(req,{method:'GET',url:path,headers:{},socket:{remoteAddress:'127.0.0.1'}});
    const res={headersSent:false,destroyed:false,headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);this.headersSent=true;},end(body){this.body=body;}};
    await handler(req,res);return res;
  }
  for(const path of ['/','/app.js','/ui-state.js','/ui-actions.js','/style.css']){const res=await get(path);assert.equal(res.status,200);assert.ok(res.body.length>0);assert.match(res.headers['Cache-Control'],/no-store/);}
  assert.equal((await get('/?partner_code=abcdefgh')).status,200);
  for(const path of ['/?unknown=1','/?partner_code=abcdefgh&partner_code=abcdefgh','/?partner_code=short'])assert.equal((await get(path)).status,400);
  for(const path of ['/../auth.js','/auth.js','/package.json','/.env','/ui-state.js/extra'])assert.equal((await get(path)).status,404);
});
test('fixture driver refuses shared/user DB and storage before any connection',async()=>{
  await assert.rejects(ownedPool({DATABASE_URL:'postgres://user:longpasswordlongpassword@example.test/userdb',UI_SCHEMA:'public',NODE_ENV:'test',PROVIDER_MODE:'fixture'}),/dedicated_owned_fixture_required/);
  assert.throws(()=>fixtureConfig({STORAGE_DIR:'/home/user/photos',APP_ORIGIN:'http://localhost'}),/owned_private_storage_required/);
});

test('owned HTTPS fixture matches normal server secure-cookie validation',()=>{
  const env={NODE_ENV:'test',PROVIDER_MODE:'fixture',WORKER_MODE:'disabled',APP_ORIGIN:'https://n8-ui.test',
    STORAGE_DIR:'/tmp/n8-ui-'+ 'a'.repeat(24),SESSION_SECRET:'ab'.repeat(32),DATABASE_URL:'postgres://owner:ab1234567890abcdef1234567890@n8-ui-pg/n8_ui_abcdef123456',
    PLATFORM_DAILY_LIMIT:'200',ACCOUNT_DAILY_LIMIT:'20'};
  assert.equal(fixtureConfig(env).secureCookie,true);assert.equal(readConfig(env).secureCookie,true);
  for(const origin of ['http://n8-ui.test','https://foreign.test','https://n8-ui.test/path','https://user:secret@n8-ui.test'])assert.throws(()=>fixtureConfig({...env,APP_ORIGIN:origin}),/owned_https_origin_required/);
});
test('schema SQL identifier and same-schema URL option are guarded before connection',async()=>{
  const env={NODE_ENV:'test',PROVIDER_MODE:'fixture',UI_FIXTURE_OWNER:'N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE',UI_SCHEMA:'n8_ui_'+ 'a'.repeat(24),
    DATABASE_URL:'postgres://owner:ab1234567890abcdef1234567890@n8-ui-pg/n8_ui_abcdef123456'};
  await assert.rejects(ownedPool(env),/dedicated_owned_fixture_required/);
  await assert.rejects(ownedPool({...env,UI_SCHEMA:'public;DROP SCHEMA public'}),/dedicated_owned_fixture_required/);
});
