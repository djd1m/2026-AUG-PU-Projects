import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const f=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=process.argv[3];fs.mkdirSync(out,{recursive:true});
const report={started_at:new Date().toISOString(),source_revision:f.source_revision,source_snapshot_sha256:f.source_snapshot_sha256,image:f.image,binding:'Actual production web/widget/Caddy/PostgreSQL; no network mocks, no paid calls. Persisted DB checks follow browser run before cleanup.',checks:[],screenshots:[]};
const browser=await chromium.connect('ws://127.0.0.1:9320');const contexts=[];let stage='start';
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});contexts.push(context);
  const page=await context.newPage(),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  stage=`badge-${width}`;await page.goto(f.host);const badge=page.locator('n6b-widget').getByRole('link',{name:'Работает на N6b'});await badge.waitFor();assert.equal(await badge.isVisible(),true);assert.equal(await badge.getAttribute('href'),f.base+'/r/b/'+f.publicId);
  const observed=[];context.on('response',r=>{if(r.url().startsWith(f.base+'/r/b/'))observed.push({url:r.url(),status:r.status(),location:r.headers().location});});
  const popupPromise=context.waitForEvent('page');await badge.click();const landing=await popupPromise;await landing.waitForURL(f.base+'/?ref='+f.publicId+'&utm_source=badge');await landing.getByRole('heading',{name:'Сделайте такого для своего сайта',exact:true}).waitFor();
  assert.ok(observed.some(x=>x.status===302&&x.location===f.base+'/?ref='+f.publicId+'&utm_source=badge'));
  const cookie=(await context.cookies(f.base)).find(c=>c.name==='n6b_ref');assert.ok(cookie);assert.equal(cookie.value,f.publicId);assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.path,'/');assert.ok(Math.abs(cookie.expires-Date.now()/1000-2592000)<15);
  assert.equal(await landing.evaluate(()=>document.cookie.includes('n6b_ref')),false);
  await landing.screenshot({path:`${out}/landing-${width}.png`,fullPage:true});report.screenshots.push(`landing-${width}.png`);
  stage=`first-touch-${width}`;const second=await landing.goto(f.base+'/?ref='+f.otherPublicId);assert.ok((second.headers()['cache-control']??'').includes('no-store'));assert.equal((await second.allHeaders())['set-cookie'],undefined);
  const preserved=(await context.cookies(f.base)).find(c=>c.name==='n6b_ref');assert.equal(preserved.value,cookie.value);assert.equal(preserved.expires,cookie.expires);
  stage=`registration-${width}`;const email=`referral-${width}-${randomUUID()}@example.test`;await landing.getByRole('link',{name:'Зарегистрироваться',exact:true}).click();await landing.getByLabel('E-mail',{exact:true}).fill(email);await landing.getByLabel('Пароль',{exact:true}).fill(f.password);await landing.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();await landing.waitForURL(f.base+'/cabinet');
  const created=await landing.request.post(f.base+'/api/bots',{headers:{Origin:f.base},data:{name:'Реферальный бот '+width,site_url:'https://8.8.8.8/referral'}});assert.equal(created.status(),202);const ownBotId=(await created.json()).data.bot_id;
  const published=await landing.request.patch(f.base+'/api/bots/'+ownBotId+'/publish',{headers:{Origin:f.base},data:{contact:'owner@example.test',allowed_origins:[f.host]}});assert.equal(published.status(),200);const ownPublicId=(await published.json()).data.public_id;
  const ownMarkup='<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><h1>Собственный бот нового аккаунта</h1><script src="'+f.base+'/w.js" data-bot="'+ownPublicId+'" async></script></body></html>';
  await page.setContent(ownMarkup);await page.locator('n6b-widget').getByRole('link',{name:'Работает на N6b'}).waitFor();
  stage=`intent-${width}`;const button=landing.getByRole('button',{name:'Убрать бейдж',exact:true});const response=landing.waitForResponse(r=>r.url()===f.base+'/api/account/badge-removal-intent'&&r.request().method()==='POST');await button.click();assert.equal((await response).status(),200);await landing.getByRole('status').filter({hasText:'Скоро: ~990 ₽/мес, оставьте заявку'}).waitFor();
  const repeated=await landing.request.post(f.base+'/api/account/badge-removal-intent',{headers:{Origin:f.base}});assert.equal(repeated.status(),200);assert.equal((await repeated.json()).data.recorded,false);
  const forbidden=await landing.request.post(f.base+'/api/account/badge-removal-intent',{headers:{Origin:f.host}});assert.equal(forbidden.status(),403);
  assert.equal(await landing.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await landing.screenshot({path:`${out}/intent-${width}.png`,fullPage:true});report.screenshots.push(`intent-${width}.png`);
  await page.setContent(ownMarkup);await page.locator('n6b-widget').getByRole('link',{name:'Работает на N6b'}).waitFor();assert.equal(await page.locator('n6b-widget').getByRole('link',{name:'Работает на N6b'}).isVisible(),true);await page.screenshot({path:`${out}/own-badge-${width}.png`,fullPage:true});report.screenshots.push(`own-badge-${width}.png`);
  assert.deepEqual(errors,[]);report.checks.push({width,email,source_bot_id:f.botId,own_bot_id:ownBotId,own_public_id:ownPublicId,click302:true,cookie_secure_httpOnly_lax_30days:true,first_touch_unchanged_no_renewal:true,registration:true,intent200_and_dedup:true,foreign403:true,own_badge_still_visible:true,layout:true,javascript_errors:0,observed});await context.close();contexts.splice(contexts.indexOf(context),1);
 }
 const anonymous=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(anonymous);const unknown=await anonymous.request.get(f.base+'/r/b/unknown00000',{maxRedirects:0});assert.equal(unknown.status(),302);assert.equal(unknown.headers().location,f.base+'/');assert.equal((await anonymous.request.post(f.base+'/api/account/badge-removal-intent',{headers:{Origin:f.base}})).status(),401);report.unknown_redirect_without_ref=true;report.anonymous_intent401=true;await anonymous.close();contexts.splice(contexts.indexOf(anonymous),1);report.status='pass';
} catch(e) {report.status='failed';report.stage=stage;report.error=String(e.stack??e);process.exitCode=1;}
finally {report.finished_at=new Date().toISOString();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));for(const c of contexts)await c.close();await browser.close();console.log(JSON.stringify(report));}
