import { mkdirSync, existsSync, writeFileSync, readFileSync, chmodSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const n3=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const p1=resolve(n3,'../01-testimonials-senja');
const root=resolve(n3,'.runtime/proofwall-e2e'),privateP1=resolve(p1,'.secrets/bridge-e2e');
const secret=()=>randomBytes(32).toString('hex');
function put(path,text) {writeFileSync(path,text,{mode:0o600});chmodSync(path,0o600);}
for(const dir of [root,privateP1,...['ca','n3','providers','output'].map(x=>`${root}/${x}`),
  ...['n3','n3-control','p1','p1-webhook','providers'].map(x=>`${root}/sockets/${x}`)])mkdirSync(dir,{recursive:true,mode:0o700});
const ca=`${root}/ca`;
const openssl=(...args)=>execFileSync('openssl',args,{stdio:'ignore'});
if(!existsSync(`${ca}/cert.pem`))openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${ca}/key.pem`,
  '-out',`${ca}/cert.pem`,'-days','2','-subj','/CN=N3 isolated bridge acceptance CA');
function certificate(dir,hosts) {
  if(existsSync(`${dir}/cert.pem`))return;
  openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',`${dir}/key.pem`,'-out',`${dir}/request.csr`,'-subj',`/CN=${hosts[0]}`);
  put(`${dir}/extensions.cnf`,`subjectAltName=${hosts.map(h=>`DNS:${h}`).join(',')}\nextendedKeyUsage=serverAuth\n`);
  openssl('x509','-req','-in',`${dir}/request.csr`,'-CA',`${ca}/cert.pem`,'-CAkey',`${ca}/key.pem`,'-CAcreateserial',
    '-out',`${dir}/cert.pem`,'-days','2','-extfile',`${dir}/extensions.cnf`);
  chmodSync(`${dir}/key.pem`,0o600);
}
certificate(privateP1,['proofwall.aicoding.space']);
certificate(`${root}/n3`,['n3-a.212.192.0.33.sslip.io']);
certificate(`${root}/providers`,['api.resend.com','api.yookassa.ru','yoomoney.ru']);
copyFileSync(`${ca}/cert.pem`,`${privateP1}/ca.pem`);
const n3Env=`${root}/database.env`,p1Env=`${privateP1}/database.env`,storageEnv=`${privateP1}/storage.env`;
if(!existsSync(n3Env))put(n3Env,`POSTGRES_USER=bridge_n3\nPOSTGRES_DB=bridge_n3\nPOSTGRES_PASSWORD=${secret()}\n`);
if(!existsSync(p1Env))put(p1Env,`POSTGRES_USER=bridge_p1\nPOSTGRES_DB=bridge_p1\nPOSTGRES_PASSWORD=${secret()}\n`);
if(!existsSync(storageEnv))put(storageEnv,`MINIO_ROOT_USER=bridge_storage\nMINIO_ROOT_PASSWORD=${secret()}\n`);
const values=path=>Object.fromEntries(readFileSync(path,'utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
put(`${root}/n3/password`,values(n3Env).POSTGRES_PASSWORD);
const base=`${privateP1}/web.env`;
if(!existsSync(base)) {
  const database=`postgresql://bridge_p1:${values(p1Env).POSTGRES_PASSWORD}@postgres:5432/bridge_p1`;
  put(base,`DATABASE_URL=${database}\nTEST_DATABASE_URL=${database}\nSESSION_SECRET=${secret()}\nBASE_URL=https://proofwall.aicoding.space\nAPP_DOMAIN=proofwall.aicoding.space\nS3_ENDPOINT=http://minio:9000\nS3_REGION=us-east-1\nS3_BUCKET=bridge-e2e\nS3_ACCESS_KEY=bridge_storage\nS3_SECRET_KEY=${values(storageEnv).MINIO_ROOT_PASSWORD}\nPAYMENTS_STUB=false\nPAID_TIER_PRICE_RUB=990\nYOOKASSA_SHOP_ID=123456\nYOOKASSA_SECRET_KEY=isolated-bridge-provider-secret\nRESEND_API_KEY=isolated-bridge-mail-secret\nMAIL_FROM=Proofwall <proofwall@example.test>\nN3_BRIDGE_ENABLED=true\nN3_BASE_URL=https://n3-a.212.192.0.33.sslip.io\n`);
}
if(process.argv.includes('--bind')) {
  const bootstrap=JSON.parse(readFileSync(`${root}/output/bootstrap.json`,'utf8'));
  const tenant=bootstrap.tenantId,key=bootstrap.connectorKey;
  if(typeof tenant!=='string' || !/^[a-f0-9-]{36}$/.test(tenant) || typeof key!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(key))throw new Error('Invalid isolated N3 bootstrap');
  const lines=readFileSync(base,'utf8').split('\n').filter(l=>l && !/^N3_(TENANT_ID|CONNECTOR_KEY)=/.test(l));
  put(base,`${lines.join('\n')}\nN3_TENANT_ID=${tenant}\nN3_CONNECTOR_KEY=${key}\n`);
}
console.log(JSON.stringify({initialized:true,root,p1Private:privateP1,realProviderCredentials:false}));
