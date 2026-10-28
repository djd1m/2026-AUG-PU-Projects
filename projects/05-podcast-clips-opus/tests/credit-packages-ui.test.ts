import { it,expect,vi } from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {UpgradeScreen} from '../apps/web/src/app/upgrade/UpgradeScreen';
import {LimitsPanel} from '../apps/web/src/app/dashboard/LimitsPanel';
import {ReturnView} from '../apps/web/src/app/upgrade/return/ReturnScreen';
import {decideReturnState} from '../apps/web/src/lib/payment-return';
import {effectivePlan} from '../packages/shared/src/tariff';
import {loadWorkerConfig} from '../packages/shared/src/config';
import {readEnvironment} from '../apps/web/src/server/environment';
import {environment} from './fixtures/environment';
import {checkWiring} from '../scripts/check-env-wiring.mjs';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('credit catalog and balance show hours, reserved credits and expiry without daily credit promises',()=>{
  const html=renderToStaticMarkup(createElement(UpgradeScreen,{creditMode:true,salesEnabled:true,title:'Pro',price:'990 ₽',days:30,paidMinutes:270,current:{plan:'free',plan_source:'none',plan_paid_until:null}}));
  for(const text of ['300 кредитов','5 ч записи','1800 кредитов','30 ч записи','600 кредитов','10 ч записи','3990','1490','Немедленный переход'])expect(html.replaceAll(' ','')).toContain(text);
  expect(html).not.toContain('270 минут');expect(html).not.toContain('Тариф Pro включён');
  const balance=renderToStaticMarkup(createElement(LimitsPanel,{remaining:{uploads:2,minutes:90,selections:2,resets_at:'2030-01-02T00:00:00Z',credits:{available_seconds:121,reserved_seconds:120,next_expiry:'2030-01-10T00:00:00Z'}}}));
  for(const text of ['Доступно кредитов','Зарезервировано','Ближайшее окончание','Кредиты автоматически не пополняются'])expect(balance).toContain(text);
});
it('future package return shows exact metadata without immediate activation claim',()=>{
  const state=decideReturnState({status:'succeeded',account_plan:'free',package_title:'Про',grant_seconds:108000,period_start:'2099-01-01T00:00:00Z',period_end:'2099-01-31T00:00:00Z'},1);
  expect(state).toMatchObject({kind:'package',credits:1800,scheduled:true});
  const html=renderToStaticMarkup(createElement(ReturnView,{state}));
  expect(html).toContain('Пакет Про оплачен');expect(html).toContain('До начала периода эти кредиты недоступны');expect(html).not.toContain('Pro включён');
});
it('shared paid-right mirror accepts independent windows only during their whole interval and excludes recovery',()=>{
  const at=new Date('2030-01-10T00:00:00Z'),window={source:'payment',start:'2030-01-01T00:00:00Z',end:'2030-01-31T00:00:00Z'};
  expect(effectivePlan('free','none',null,at,[window])).toBe('paid');
  expect(effectivePlan('free','none',null,new Date(window.end),[window])).toBe('free');
  expect(effectivePlan('free','none',null,at,[{...window,source:'recovery'}])).toBe('free');
});
it('synthetic compose and actual web/worker projections preserve explicit billing mode; absence controls fail wiring',()=>{
  const env={...environment(),PATH:process.env.PATH,N5_BILLING_MODE:'credits_v1',N5_DB_APP_PASSWORD:'synthetic-db',REDIS_PASSWORD:'synthetic-redis',MINIO_ROOT_USER:'synthetic-minio',MINIO_ROOT_PASSWORD:'synthetic-minio-secret'};
  const result=spawnSync('docker',['compose','--env-file','/dev/null','--project-directory','.','--profile','test','config','--format','json'],{env,encoding:'utf8',timeout:10000});
  expect(result.status).toBe(0);const config=JSON.parse(result.stdout) as {services:Record<string,{environment:NodeJS.ProcessEnv}>};
  expect(checkWiring(config)).toEqual([]);
  vi.stubEnv('N5_BILLING_MODE','credits_v1');expect(readEnvironment().N5_BILLING_MODE).toBe('credits_v1');vi.unstubAllEnvs();
  for(const [name,role] of [['stt','worker-stt'],['select','worker-llm'],['render','worker-video']] as const){
    let projected:NodeJS.ProcessEnv|undefined;
    const code=ts.transpileModule(readFileSync(`apps/worker/workers/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    runInNewContext(code,{exports:{},process:{env:config.services[role]!.environment},require:(id:string)=>{
      if(id.endsWith('/runtime'))return {startWorker:async(_role:string,input:NodeJS.ProcessEnv)=>{projected=input;}};
      if(id.endsWith('/quota-environment'))return {quotaEnvironment:()=>environment()};
      if(id.endsWith('/render/diagnostics'))return {renderErrorMessage:String};throw new Error(id);
    }});
    expect(projected?.N5_BILLING_MODE,role).toBe('credits_v1');expect(loadWorkerConfig(role,projected!).billingMode).toBe('credits_v1');
    delete config.services[role]!.environment.N5_BILLING_MODE;expect(checkWiring(config)).toContain(`${role}: N5_BILLING_MODE`);
    config.services[role]!.environment.N5_BILLING_MODE='credits_v1';
  }
  delete config.services.web!.environment.N5_BILLING_MODE;expect(checkWiring(config)).toContain('web: N5_BILLING_MODE');
});
it('legacy catalogue shows all canonical packages with disabled checkout and preserves conditions',()=>{
  const html=renderToStaticMarkup(createElement(UpgradeScreen,{creditMode:true,catalogOnly:true,salesEnabled:false,title:'Pro',price:'990 ₽',days:30,paidMinutes:270,current:{plan:'free',plan_source:'none',plan_paid_until:null}}));
  for(const text of ['Старт','Про','300 кредитов','1800 кредитов','600 кредитов','Ваши текущие условия сохраняются','один раз','Ежемесячного пополнения нет'])expect(html).toContain(text);
  expect((html.match(/<button disabled=""/g)??[])).toHaveLength(3);
  expect(html).not.toContain('Не удалось определить даты');
  expect(html).not.toContain('Тариф Pro');
});
it('cabinet exposes pricing and authenticated upgrade keeps catalogue open without a payment provider',()=>{
  const layout=readFileSync('apps/web/src/app/dashboard/layout.tsx','utf8');
  expect(layout).toMatch(/<Link href="\/upgrade\?from=partner_dashboard">Тарифы<\/Link>/);
  expect(readFileSync('apps/web/src/app/dashboard/page.tsx','utf8')).toContain('<ProInterest creditMode={true}');
  const source=readFileSync('apps/web/src/app/upgrade/page.tsx','utf8');
  expect(source).not.toContain('notFound');
  expect(source).toContain('if (!session) redirect(login)');
  expect(source).toContain('creditMode={true}');
  expect(source).toContain("catalogOnly={billing.billing_policy!=='credits_v1'}");
  expect(source).toContain("salesEnabled={!!payments && config.billingMode==='credits_v1' && billing.billing_policy==='credits_v1'}");
});
it('payment outage keeps credit catalogue visible with every purchase disabled',()=>{
  const html=renderToStaticMarkup(createElement(UpgradeScreen,{creditMode:true,salesEnabled:false,purchaseWindows:{asOf:'2030-01-01T00:00:00Z',baseStart:'2030-01-01T00:00:00Z',baseEnd:'2030-01-31T00:00:00Z',addonStart:'2030-01-01T00:00:00Z',addonEnd:'2030-01-31T00:00:00Z',scheduled:false},title:'Pro',price:'990 ₽',days:30,paidMinutes:270,current:{plan:'free',plan_source:'none',plan_paid_until:null}}));
  expect((html.match(/<button disabled=""/g)??[])).toHaveLength(3);
  expect(html).toContain('Продажа новых пакетов временно выключена');
});
