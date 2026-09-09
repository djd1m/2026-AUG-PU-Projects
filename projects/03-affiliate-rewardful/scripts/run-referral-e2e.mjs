import { spawn,execFileSync } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const directory=resolve('.runtime/referral-e2e'),container='n3-referral-browser';
const driverUrl='http://127.0.0.1:4571',sessionPath=directory+'/webdriver-session.json';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function free(port) {const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>server.close(resolve));}
async function ready(url) {for(let n=0;n<100;n++){try {const r=await fetch(url);if(r.ok)return;}catch{}await sleep(250);}throw new Error(`Isolated service did not become ready: ${url}`);}
let driver,sessionId,started=false,driverOutput='';
await mkdir(directory,{recursive:true});
try {
  for(const port of [13143,13144,4571])await free(port);
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',directory+'/key.pem','-out',directory+'/cert.pem','-days','2','-subj','/CN=merchant.example','-addext','subjectAltName=DNS:merchant.example,DNS:*.212.192.0.33.sslip.io'],{stdio:'ignore'});
  execFileSync('docker',['compose','-f','docker-compose.test.yml','run','--rm','--no-deps','-d','--name',container,
    '-p','127.0.0.1:13143:13143','-p','127.0.0.1:13144:13144','backend','node','tests/helpers/referral-merchant.mjs'],{stdio:'pipe'});started=true;
  execFileSync('docker',['network','connect','n3-frontend',container],{stdio:'pipe'});
  await ready('http://127.0.0.1:13144/context');
  driver=spawn('geckodriver',['--port','4571','--host','127.0.0.1','--profile-root',process.env.N3_FIREFOX_PROFILE_ROOT || '/root/snap/firefox/common'],{stdio:['ignore','pipe','pipe']});
  driver.stdout.on('data',x=>{driverOutput+=x;});driver.stderr.on('data',x=>{driverOutput+=x;});
  await ready(driverUrl+'/status');
  const response=await fetch(driverUrl+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({capabilities:{alwaysMatch:{browserName:'firefox',acceptInsecureCerts:true,
    proxy:{proxyType:'manual',httpProxy:'127.0.0.1:13143',sslProxy:'127.0.0.1:13143',noProxy:[]},
    'moz:firefoxOptions':{args:['-headless'],prefs:{'network.proxy.allow_hijacking_localhost':true,'network.proxy.no_proxies_on':'','network.captive-portal-service.enabled':false,'network.connectivity-service.enabled':false}}}}})});
  const session=await response.json();if(!response.ok)throw new Error(session.value?.message || 'WebDriver creation failed');
  sessionId=session.value.sessionId;await writeFile(sessionPath,JSON.stringify(session));
  const child=spawn(process.execPath,['--test','--test-concurrency=1','tests/e2e/referral.mjs'],{env:{...process.env,N3_WEBDRIVER_URL:driverUrl,N3_WEBDRIVER_SESSION:sessionPath},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  await writeFile(directory+'/browser.tap',output);await writeFile(directory+'/driver.log',driverOutput);process.exitCode=exitCode || 0;
} catch(error) {
  console.error(error.message);process.exitCode=1;
  if(started){try{await writeFile(directory+'/harness.log',execFileSync('docker',['logs',container],{encoding:'utf8'}));}catch{}}
} finally {
  await writeFile(directory+'/driver.log',driverOutput);
  if(sessionId){try{await fetch(`${driverUrl}/session/${sessionId}`,{method:'DELETE',signal:AbortSignal.timeout(10000)});}catch{}}
  if(driver)driver.kill('SIGTERM');
  if(started){try{execFileSync('docker',['stop','--time','12',container],{stdio:'ignore'});}catch{}}
}
