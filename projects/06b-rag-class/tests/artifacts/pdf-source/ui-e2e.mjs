import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8'));
const output=process.argv[3], base='https://n6b-ui.test';
await mkdir(output,{recursive:true});
const report={started_at:new Date().toISOString(),source_snapshot_sha256:fixture.source_snapshot_sha256,build_image_id:fixture.image,status:'running',scope:'PDF upload UI and persisted queued-job visibility; worker extraction covered by real-DB integration suite',checks:[]};
const sessions=[];
const browser=await chromium.connect('ws://127.0.0.1:9320/');
let stage='start';
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  stage=`register-${width}`;
  await page.goto(base+'/register');
  await page.getByLabel('E-mail',{exact:true}).fill(`pdf-${randomUUID()}@example.test`);
  await page.getByLabel('Пароль',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  await page.waitForURL(base+'/cabinet');
  const created=await page.request.post(base+'/api/bots',{headers:{Origin:base},data:{name:'PDF '+width}});
  if(created.status()!==201) throw Error('Idle bot creation status '+created.status());
  const bot=(await created.json()).data;
  await page.reload();
  const form=page.getByRole('form',{name:'Добавить PDF',exact:true});
  const input=form.locator('input[type=file]');
  await input.waitFor();
  if(await input.getAttribute('accept')!=='application/pdf,.pdf') throw Error('PDF accept missing');
  stage=`invalid-${width}`;
  await input.setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid')});
  let response=page.waitForResponse(r=>r.url()===base+`/api/bots/${bot.bot_id}/sources`&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Добавить PDF',exact:true}).click();
  if((await response).status()!==415) throw Error('Invalid magic not 415');
  await form.getByRole('alert').waitFor();
  await page.screenshot({path:`${output}/invalid-${width}.png`,fullPage:true});
  stage=`oversize-${width}`;
  await input.setInputFiles({name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
  await form.getByRole('button',{name:'Добавить PDF',exact:true}).click();
  await form.getByRole('alert').filter({hasText:'PDF должен быть не больше 10 МиБ'}).waitFor();
  stage=`upload-${width}`;
  await input.setInputFiles({name:'guide-two-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture.pdf_base64,'base64')});
  response=page.waitForResponse(r=>r.url()===base+`/api/bots/${bot.bot_id}/sources`&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Добавить PDF',exact:true}).click();
  const accepted=await response;
  if(accepted.status()!==202) throw Error('PDF upload status '+accepted.status());
  const job=(await accepted.json()).data;
  if(!job.job_id) throw Error('Job ID missing');
  await page.getByText('guide-two-pages.pdf',{exact:true}).waitFor();
  const status=await page.request.get(base+'/api/jobs/'+job.job_id);
  if(status.status()!==200||(await status.json()).data.state!=='running') throw Error('Queued job unavailable');
  if(!await input.isDisabled()) throw Error('PDF input enabled during indexing');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error('Horizontal overflow '+width);
  await page.screenshot({path:`${output}/accepted-${width}.png`,fullPage:true});
  if(errors.length) throw Error('JavaScript errors: '+errors.length);
  report.checks.push({viewport:width,registration:'pass',idle_bot_201:'pass',invalid_magic_415:'pass',oversize_client_error:'pass',pdf_upload_202:'pass',filename_and_job_visible:'pass',busy_disabled:'pass',layout:'pass',javascript_errors:0});
  sessions.push({context,page,width,errors});
 }
 // Start the real fake-provider worker only after both queued/live checks above.
 // No cancel API exists; a signature-valid damaged PDF reaches failed through the worker.
 console.log(JSON.stringify({stage:'terminal-worker-required',instruction:'Start the own-stack worker with the fake provider now'}));
 for(const {context,page,width,errors} of sessions) {
  stage=`terminal-first-refresh-${width}`;
  const created=await page.request.post(base+'/api/bots',{headers:{Origin:base},data:{name:'Terminal PDF '+width}});
  if(created.status()!==201) throw Error('Terminal bot creation status '+created.status());
  const bot=(await created.json()).data;
  await page.reload();
  const card=page.locator('.bot-card').filter({has:page.getByRole('heading',{name:'Terminal PDF '+width,exact:true})});
  const form=card.getByRole('form',{name:'Добавить PDF',exact:true});
  const input=form.locator('input[type=file]'), button=form.getByRole('button',{name:'Добавить PDF',exact:true});
  const endpoint=base+`/api/bots/${bot.bot_id}/sources`;
  let heldJobId, terminalError, interceptionError;
  await page.route(endpoint,async route=>{
   if(route.request().method()!=='POST') return route.continue();
   try {
    const real=await route.fetch();
    if(real.status()!==202) throw Error('Terminal upload status '+real.status());
    heldJobId=(await real.json()).data.job_id;
    if(!heldJobId) throw Error('Terminal job ID missing');
    if(!await input.isDisabled()) throw Error('PDF input enabled while POST pending');
    const deadline=Date.now()+60000;
    while(Date.now()<deadline) {
     const status=await page.request.get(base+'/api/jobs/'+heldJobId);
     if(status.status()!==200) throw Error('Own terminal job unavailable');
     const job=(await status.json()).data;
     if(job.state==='failed') {terminalError=job.error;break;}
     if(job.state==='succeeded') throw Error('Damaged PDF unexpectedly succeeded');
     await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!terminalError) throw Error('Real worker did not fail damaged PDF before first refresh');
    // Deliver the exact backend response only once its own job is already terminal.
    await route.fulfill({response:real});
   } catch(error) {interceptionError=error;await route.abort();}
  },{times:1});
  await input.setInputFiles({name:'damaged-first-refresh.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\ninvalid document\n')});
  const response=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='POST',{timeout:65000});
  await button.click();
  await response;
  if(interceptionError) throw interceptionError;
  await card.getByText('damaged-first-refresh.pdf',{exact:true}).waitFor();
  await card.locator(`[data-job-id="${heldJobId}"][data-state="failed"]`).waitFor();
  await card.getByText('Не удалось: '+terminalError,{exact:true}).waitFor();
  await input.evaluate(el=>new Promise((resolve,reject)=>{
   const deadline=Date.now()+10000;
   const check=()=>{if(!el.disabled) resolve();else if(Date.now()>deadline) reject(Error('PDF input stayed disabled after terminal first refresh'));else setTimeout(check,50);};check();
  }));
  if(await button.isDisabled()) throw Error('PDF button stayed disabled after terminal first refresh');
  stage=`another-upload-${width}`;
  await input.setInputFiles({name:'another-after-terminal.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture.pdf_base64,'base64')});
  const next=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='POST');
  await button.click();
  const accepted=await next;
  if(accepted.status()!==202||!(await accepted.json()).data.job_id) throw Error('Another PDF not accepted after terminal first refresh');
  await card.getByText('another-after-terminal.pdf',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/terminal-first-refresh-${width}.png`,fullPage:true});
  if(errors.length) throw Error('JavaScript errors: '+errors.length);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error('Terminal horizontal overflow '+width);
  report.checks.push({viewport:width,terminal_job_id:heldJobId,terminal_before_202_delivery:'failed',pending_disabled:'pass',terminal_first_refresh_enabled:'pass',another_upload_202:'pass'});
  await context.close();
 }
 report.status='pass';
} catch(e) {report.status='fail';report.failure={stage,message:String(e.message).split(fixture.password).join('[redacted]')};process.exitCode=1;}
finally {await browser.close();report.finished_at=new Date().toISOString();await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
