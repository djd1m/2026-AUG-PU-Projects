import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Reuse an explicitly provisioned local WebDriver; never start or stop another session.
const endpoint = new URL(process.env.N3_WEBDRIVER_URL || 'http://127.0.0.1:4569');
if (!['127.0.0.1','localhost'].includes(endpoint.hostname)) throw new Error('Local WebDriver required');
const receipt = JSON.parse(await readFile(process.env.N3_WEBDRIVER_SESSION || '/tmp/n3-browser-session.json','utf8'));
const sessionId = receipt.value?.sessionId || receipt.sessionId;
if (!sessionId) throw new Error('WebDriver session receipt required');
const base = `${endpoint.origin}/session/${encodeURIComponent(sessionId)}`;
export async function wd(path, data, method) {
  const response = await fetch(base+path, {method:method || (data===undefined?'GET':'POST'),
    headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(55000)});
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(`WebDriver ${path}: ${result.value?.message || response.status}`);
  return result.value;
}
export const js = (script,...args) => wd('/execute/sync',{script,args});
export const element = selector => wd('/element',{using:'css selector',value:selector});
export async function click(selector) {
  const el = await element(selector);
  await wd(`/element/${Object.values(el)[0]}/click`,{});
}
export async function fill(selector,value) {
  const el=await element(selector),id=Object.values(el)[0];
  await wd(`/element/${id}/clear`,{});
  await wd(`/element/${id}/value`,{text:String(value)});
}
export async function until(script, timeout=15000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {
    if(await js(script))return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`Browser condition timed out: ${script}`);
}
export async function open(url) {
  await wd('/frame',{id:null});
  await wd('/timeouts',{pageLoad:45000,script:30000});
  await wd('/window/rect',{width:1440,height:1000});
  await wd('/url',{url});
}
export async function mobile(url) {
  await open(new URL('/mobile.html',url).href);
  await wd('/frame',{id:await element('#mobile-frame')});
  await until('return document.readyState === "complete"');
  assert.equal(await js('return innerWidth'),390);
}
export async function screenshot(directory,name) {
  await mkdir(directory,{recursive:true});
  const target=resolve(directory,name+'.png');
  const png=await wd('/screenshot');
  await writeFile(target,Buffer.from(png,'base64'));
  return target;
}
export async function noOverflow() {
  const sizes=await js('return {viewport:innerWidth,document:document.documentElement.scrollWidth}');
  assert.ok(sizes.document<=sizes.viewport,`Horizontal overflow: ${JSON.stringify(sizes)}`);
  return sizes;
}
