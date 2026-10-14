import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {texturedGlb} from '../tests/space/fixtures.ts';
const origin='https://n8.77.83.87.178.sslip.io';
const output=process.env.N8_E2E_OUTPUT;if(!output||!process.env.N8_BUILD_REVISION)throw Error('Explicit evidence directory/build required');
// Referenced 8K texture reproduces the native pixel error; pad BIN above10MiB to cover byte routing too.
function largeGlb(input){const n=input.readUInt32LE(12),j=JSON.parse(input.subarray(20,20+n).toString());const bin=Buffer.alloc(11*1024*1024);input.subarray(28+n).copy(bin);j.buffers[0].byteLength=bin.length;const raw=Buffer.from(JSON.stringify(j)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const out=Buffer.alloc(28+json.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(bin.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);bin.copy(out,28+json.length);return out;}
const texture=await sharp({create:{width:8192,height:8192,channels:3,background:'white'}}).jpeg().toBuffer();
const bytes=largeGlb(texturedGlb(texture)),checks=[],errors=[],startedAt=new Date().toISOString();
const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
async function submit(button,suffix){const pending=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST',{timeout:30000});await button.click();return pending;}
async function checked(name,fn){await fn();checks.push(name);process.stdout.write(`PASS ${name}\n`);}
try{
 await page.goto(origin+'/login?mode=register');await page.getByLabel('Почта',{exact:true}).fill(`glb-${randomUUID()}@example.test`);await page.getByLabel(/^Пароль/).fill(`repair-${randomUUID()}`);await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();await page.waitForURL('**/dashboard');await page.getByLabel('Название',{exact:true}).fill('GLB upload test');await page.getByLabel('Регион',{exact:true}).fill('Москва');await page.getByRole('button',{name:'Создать проект',exact:true}).click();await page.waitForURL('**/dashboard/*');const projectId=page.url().split('/').at(-1);
 const current=async()=>{const r=await context.request.get(origin+`/api/projects/${projectId}`);assert.equal(r.status(),200);return(await r.json()).data;};
 const generic=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Загрузить фото, чертёж или GLB',exact:true})});
 await checked('one GLB file picker without duplicate form',async()=>{await generic.locator('input[type=file]').waitFor();assert.equal(await page.locator('input[type=file][accept*=".glb"]').count(),1);assert.equal(await page.getByRole('heading',{name:'Загрузить 3D-скан GLB',exact:true}).count(),0);});
 let firstAsset;
 await checked('single file picker accepts11MiB GLB with real8192square texture and automatic kind routing',async()=>{
  await generic.locator('input[type=file]').setInputFiles({name:'scan.GLB',mimeType:'application/octet-stream',buffer:bytes});assert.equal(await generic.getByLabel('Для чего файл').inputValue(),'glb');
  await generic.getByLabel('Для чего файл').selectOption('room_photo');await generic.getByRole('checkbox').check();const response=await submit(generic.getByRole('button',{name:'Загрузить приватно'}),'/assets');assert.equal(response.request().headers()['x-asset-kind'],'glb');assert.equal(response.status(),201,await response.text());firstAsset=(await response.json()).data;assert.equal(firstAsset.kind,'glb');assert.equal(firstAsset.bytes,bytes.length);
  await page.getByLabel('Загруженный GLB').waitFor();await page.waitForFunction(id=>document.querySelector('select[name="asset"]')?.value===id,firstAsset.id);assert.equal((await current()).currentShellId,null);
 });
 let firstShell;
 await checked('UI calibration saves selected scan, survives reload and original hash matches',async()=>{
  await page.getByLabel('Точка A',{exact:true}).fill('0,0,0');await page.getByLabel('Точка B',{exact:true}).fill('1,0,0');await page.getByLabel('Измеренное расстояние, м',{exact:true}).fill('2');await page.getByRole('checkbox',{name:/Проверил масштаб/}).check();const r=await submit(page.getByRole('button',{name:'Подтвердить масштаб'}),'/shells');assert.equal(r.status(),201,await r.text());firstShell=(await r.json()).data;assert.equal(firstShell.sourceAssetId,firstAsset.id);assert.equal(firstShell.floorAreaM2,null);await page.reload();assert.equal(await page.getByLabel('Загруженный GLB').inputValue(),firstAsset.id);assert.equal(await page.getByLabel('Измеренное расстояние, м',{exact:true}).inputValue(),'2');const original=await context.request.get(origin+'/api/assets/'+firstAsset.id+'?original=1');assert.equal(original.status(),200);assert.equal(createHash('sha256').update(await original.body()).digest('hex'),createHash('sha256').update(bytes).digest('hex'));await page.waitForLoadState('networkidle');await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c&&c.width>0&&!!(c.getContext('webgl2')||c.getContext('webgl'));});assert.equal(await page.getByText('3D недоступно. Используйте план и подтверждённые размеры.',{exact:true}).count(),0);await page.screenshot({path:output+'/textured-glb.png',fullPage:true});
 });
 const dedicated=generic;
 await checked('second upload through same picker resets calibration without replacing confirmed shell',async()=>{
  assert.match(await dedicated.locator('input[type=file]').getAttribute('accept'),/\.glb/);await dedicated.locator('input[type=file]').setInputFiles({name:'second.glb',mimeType:'model/gltf-binary',buffer:bytes});await dedicated.getByRole('checkbox').check();const r=await submit(dedicated.getByRole('button',{name:'Загрузить GLB',exact:true}),'/assets');assert.equal(r.status(),201,await r.text());const asset=(await r.json()).data;await page.waitForFunction(id=>document.querySelector('select[name="asset"]')?.value===id,asset.id);assert.equal(await page.getByLabel('Точка A',{exact:true}).inputValue(),'');assert.equal(await page.getByRole('checkbox',{name:/Проверил масштаб/}).isChecked(),false);assert.equal((await current()).currentShellId,firstShell.id);
 });
 await checked('malformed GLB rejected through UI, original confirmed shell preserved',async()=>{
  await dedicated.locator('input[type=file]').setInputFiles({name:'invalid.glb',mimeType:'application/octet-stream',buffer:Buffer.from('bad glb')});const r=await submit(dedicated.getByRole('button',{name:'Загрузить GLB',exact:true}),'/assets');assert.equal(r.status(),422);await dedicated.getByRole('alert').waitFor();assert.equal((await current()).currentShellId,firstShell.id);
 });
 await checked('GLB above 25MiB rejected by authoritative server with 413',async()=>{
  await dedicated.locator('input[type=file]').setInputFiles({name:'over.glb',mimeType:'application/octet-stream',buffer:Buffer.alloc(25*1024*1024+1)});const r=await submit(dedicated.getByRole('button',{name:'Загрузить GLB',exact:true}),'/assets');assert.equal(r.status(),413);await dedicated.getByRole('alert').waitFor();assert.equal((await current()).currentShellId,firstShell.id);
 });
 await checked('image remains subject to 10MiB limit',async()=>{
  await generic.locator('input[type=file]').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)});assert.equal(await generic.getByLabel('Для чего файл').inputValue(),'room_photo');await generic.getByRole('checkbox').check();const r=await submit(generic.getByRole('button',{name:'Загрузить приватно'}),'/assets');assert.equal(r.status(),413);
 });
 await checked('390px screen has no horizontal overflow and no runtime JavaScript errors',async()=>{await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.screenshot({path:output+'/mobile.png',fullPage:true});});
 await writeFile(output+'/result.json',JSON.stringify({status:'passed',startedAt,finishedAt:new Date().toISOString(),buildRevision:process.env.N8_BUILD_REVISION,fixtureBytes:bytes.length,embeddedTexture:{width:8192,height:8192},checks,errors,userFileTested:false},null,2)+'\n');
}catch(e){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(output+'/failure.json',JSON.stringify({status:'failed',checks,error:e.message},null,2));throw e;}finally{await context.close();await browser.close();}
