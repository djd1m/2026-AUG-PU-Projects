import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createApp} from '../web/app.js';
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
