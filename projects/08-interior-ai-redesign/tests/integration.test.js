import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, writeFile, utimes, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { createPool } from '../web/db.js';
import { readConfig } from '../web/config.js';
import { createApp } from '../web/app.js';
import { createAuth, DUMMY_HASH, tokenHash } from '../web/auth.js';
import { createMedia, prepareStorage, sweepOrphans } from '../web/media.js';
import { migrate } from '../scripts/migrate.js';

// Requires a dedicated isolated PostgreSQL16 service, never an in-memory substitute.
test('F01 real PostgreSQL16 transactions, sessions, abuse and media ownership',async t => {
  if (!process.env.TEST_DATABASE_URL || process.env.N8_TEST_DB_OWNERSHIP !== 'n8-f01') throw new Error('Dedicated F01 PostgreSQL URL and ownership assertion required');
  const databaseUrl=new URL(process.env.TEST_DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]','db'].includes(databaseUrl.hostname)) throw new Error('Only dedicated local/internal test DB allowed');
  const admin=new pg.Pool({connectionString:databaseUrl.href,max:2,connectionTimeoutMillis:2000});
  const schema='f01_'+randomBytes(8).toString('hex'); let pool,server,secondServer,dir;
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);
    databaseUrl.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(databaseUrl.href); await migrate(pool); await migrate(pool);
    dir=await mkdtemp(join(tmpdir(),'n8-f01-')); await prepareStorage(dir);
    const secret=randomBytes(32).toString('hex');
    const config=readConfig({NODE_ENV:'test',DATABASE_URL:databaseUrl.href,SESSION_SECRET:secret,APP_ORIGIN:'http://127.0.0.1:18088',STORAGE_DIR:dir,PROVIDER_MODE:'disabled',WORKER_MODE:'disabled'});
    server=createApp(pool,config); await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${server.address().port}`;
    async function call(path,{method='GET',body,cookie,origin=config.origin,mime='application/json',headers={}}={}) {
      const result=await fetch(base+path,{method,headers:{...(method!=='GET'&&origin!==undefined?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':mime}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
      const bytes=Buffer.from(await result.arrayBuffer());
      return {status:result.status,headers:result.headers,bytes,json:result.headers.get('content-type')?.includes('json')?JSON.parse(bytes.toString()):null};
    }
    const password='я'.repeat(128); let cookieA,cookieB,accountA,upload;
    await t.test('AUTH-01 concurrent canonical registration gives one account/trial/session atomically',async () => {
      const attempts=await Promise.all([call('/api/register',{method:'POST',body:{email:' Alice@Example.com ',password}}),call('/api/register',{method:'POST',body:{email:'alice@example.com',password}})]);
      assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]); cookieA=attempts.find(r=>r.status===201).headers.get('set-cookie').split(';')[0];
      const rows=await pool.query("SELECT a.id,count(l.id)::int AS trials,sum(l.delta)::int AS balance FROM account a JOIN credit_ledger l ON l.account_id=a.id WHERE a.email='alice@example.com' GROUP BY a.id");
      assert.equal(rows.rowCount,1); assert.equal(rows.rows[0].trials,1); assert.equal(rows.rows[0].balance,1); accountA=rows.rows[0].id;
      const me=await call('/api/me',{cookie:cookieA}); assert.equal(me.status,200); assert.equal(me.json.account.credits,1);
      const sessions=await pool.query('SELECT token_hash,expires_at,created_at FROM session WHERE account_id=$1',[accountA]);
      assert.equal(sessions.rowCount,1); assert.equal(sessions.rows[0].token_hash,tokenHash(cookieA.split('=')[1],secret));
      assert.ok(Math.abs(sessions.rows[0].expires_at-sessions.rows[0].created_at-604800000)<2000);
    });
    await t.test('AUTH-01 11/129 reject, 12 valid, long Unicode suffix cannot bypass',async () => {
      for (const length of [11,129]) assert.equal((await call('/api/login',{method:'POST',body:{email:'alice@example.com',password:'a'.repeat(length)}})).status,400);
      assert.equal((await call('/api/login',{method:'POST',body:{email:'alice@example.com',password:'я'.repeat(127)+'ю'}})).status,401);
      const b=await call('/api/register',{method:'POST',body:{email:'bob@example.com',password:'b'.repeat(12)}}); assert.equal(b.status,201); cookieB=b.headers.get('set-cookie').split(';')[0];
      const login=await call('/api/login',{method:'POST',body:{email:'bob@example.com',password:'b'.repeat(12)}}); assert.equal(login.status,200);
    });
    await t.test('AUTH-02 dummy hash, generic wrong/unknown denial, logout and exact expiry',async () => {
      let compared;
      const instrumented=createAuth(pool,secret,async (password,hash)=>{ compared=hash; return false; });
      await assert.rejects(instrumented.login('absent@example.com','x'.repeat(12)),error=>error.status===401); assert.equal(compared,DUMMY_HASH);
      const unknown=await call('/api/login',{method:'POST',body:{email:'absent@example.com',password:'x'.repeat(12)}});
      const wrong=await call('/api/login',{method:'POST',body:{email:'alice@example.com',password:'x'.repeat(12)}}); assert.deepEqual(unknown.json,wrong.json);
      assert.equal((await call('/api/me',{cookie:'roomkind_session='+randomBytes(32).toString('base64url')})).status,401);
      const hash=tokenHash(cookieA.split('=')[1],secret);
      await pool.query("UPDATE session SET expires_at=now()+interval '1 minute' WHERE token_hash=$1",[hash]); assert.equal((await call('/api/me',{cookie:cookieA})).status,200);
      await pool.query('UPDATE session SET expires_at=now() WHERE token_hash=$1',[hash]); assert.equal((await call('/api/me',{cookie:cookieA})).status,401);
      const login=await call('/api/login',{method:'POST',body:{email:'alice@example.com',password}}); cookieA=login.headers.get('set-cookie').split(';')[0];
      const logout=await call('/api/logout',{method:'POST',body:{},cookie:cookieA}); assert.equal(logout.status,200); assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
      assert.equal((await call('/api/me',{cookie:cookieA})).status,401);
      const relogin=await call('/api/login',{method:'POST',body:{email:'alice@example.com',password}}); cookieA=relogin.headers.get('set-cookie').split(';')[0];
    });
    await t.test('AUTH-03/SEC-02 write Origin and 16KiB limits; spoofed forwarding does not bypass',async () => {
      for (const origin of [null,'null','http://evil.test']) {
        const headers=origin===null?{}:{Origin:origin};
        const response=await fetch(base+'/api/logout',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookieA,...headers},body:'{}'}); assert.equal(response.status,403);
      }
      assert.equal((await call('/api/logout',{method:'POST',body:{value:'x'.repeat(16385)},cookie:cookieA})).status,413);
      const results=await Promise.all(Array.from({length:11},(_,i)=>call('/api/login',{method:'POST',body:{email:'rate@example.com',password:'x'.repeat(12)},headers:{'X-Forwarded-For':`192.0.2.${i}`}})));
      assert.equal(results.filter(r=>r.status===429).length,1); assert.ok(results.filter(r=>r.status===401||r.status===503).length===10);
    });
    await t.test('UPLOAD-01/02 two-account decode/read/list/delete and traversal',async () => {
      const image=await sharp({create:{width:8,height:6,channels:3,background:'#ad6847'}}).jpeg().withMetadata({orientation:6}).toBuffer();
      const result=await call('/api/uploads',{method:'POST',body:image,mime:'image/jpeg',cookie:cookieA}); assert.equal(result.status,201); upload=result.json.upload;
      assert.equal(upload.width,6); assert.equal(upload.height,8); assert.equal(upload.private_key,undefined);
      const owner=await call('/api/uploads/'+upload.id,{cookie:cookieA}); assert.equal(owner.status,200); assert.match(owner.headers.get('cache-control'),/no-store/); assert.equal((await sharp(owner.bytes).metadata()).exif,undefined);
      for (const method of ['GET','DELETE']) { const other=await call('/api/uploads/'+upload.id,{method,cookie:cookieB}); assert.equal(other.status,404); assert.equal(other.headers.get('content-type').startsWith('image/'),false); }
      assert.equal((await call('/api/uploads',{cookie:cookieB})).json.uploads.length,0);
      assert.equal((await call('/api/uploads/'+randomUUID(),{cookie:cookieB})).status,404);
      assert.equal((await call('/api/uploads/not-a-uuid',{cookie:cookieA})).status,400);
      assert.equal((await call('/api/uploads/%2e%2e%2fsecret',{cookie:cookieA})).status,400);
      assert.equal((await call('/api/uploads',{method:'POST',body:{url:'https://example.com/photo'},cookie:cookieA})).status,400);
      assert.equal((await call('/api/uploads',{method:'POST',body:image,mime:'image/png',cookie:cookieA})).status,422);
    });
    await t.test('UPLOAD-02 real DB insert failure removes temp/final; sweep retains live/recent/non-UUID/symlink',async () => {
      const before=await readdir(dir);
      await pool.query(`CREATE FUNCTION reject_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture database failure'; END $$`);
      await pool.query('CREATE TRIGGER reject_upload BEFORE INSERT ON upload FOR EACH ROW EXECUTE FUNCTION reject_upload()');
      const png=await sharp({create:{width:3,height:2,channels:3,background:'#fff'}}).png().toBuffer();
      await assert.rejects(createMedia(pool,dir).save(accountA,png,'image/png'));
      assert.deepEqual(await readdir(dir),before); assert.deepEqual(await readdir(join(dir,'.tmp')),[]);
      await pool.query('DROP TRIGGER reject_upload ON upload');
      const old=randomUUID(),recent=randomUUID(),temp=randomUUID(),link=randomUUID(); const oldTime=new Date(Date.now()-3600001);
      for (const id of [old,recent,'untrusted-name']) await writeFile(join(dir,id),'fixture');
      await writeFile(join(dir,'.tmp',temp),'fixture'); await symlink(join(dir,old),join(dir,link));
      for (const path of [join(dir,old),join(dir,upload.id),join(dir,'untrusted-name'),join(dir,'.tmp',temp)]) await utimes(path,oldTime,oldTime);
      assert.equal(await sweepOrphans(pool,dir),2);
      const remaining=await readdir(dir); for (const id of [upload.id,recent,'untrusted-name',link]) assert.ok(remaining.includes(id));
      assert.equal((await call('/api/uploads/'+upload.id,{method:'DELETE',cookie:cookieA})).status,200);
      assert.equal((await call('/api/uploads/'+upload.id,{cookie:cookieA})).status,404);
    });
    await t.test('AUTH-03 exact registration/IP and login/IP limits; SEC-02 121st API request',async () => {
      // A fresh server owns fresh limiter state, still using the actual DB/storage.
      secondServer=createApp(pool,config); await new Promise(resolve=>secondServer.listen(0,'127.0.0.1',resolve));
      const base2=`http://127.0.0.1:${secondServer.address().port}`;
      async function login(email) {return fetch(base2+'/api/login',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:'x'.repeat(12)})});}
      for(let i=0;i<50;i++) assert.equal((await login(`no-${i}@example.com`)).status,401);
      assert.equal((await login('51@example.com')).status,429);
      for(let i=0;i<5;i++) assert.equal((await fetch(base2+'/api/register',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{}'})).status,400);
      assert.equal((await fetch(base2+'/api/register',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{}'})).status,429);
      for(let i=0;i<63;i++) assert.equal((await fetch(base2+'/api/me')).status,401); // 51+6+63=120
      assert.equal((await fetch(base2+'/api/me')).status,429);
    });
  } finally {
    for(const app of [server,secondServer]) if(app) { app.closeAllConnections(); await new Promise(resolve=>app.close(resolve)); }
    await pool?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{}); await admin.end();
    if(dir) await rm(dir,{recursive:true,force:true});
  }
});
