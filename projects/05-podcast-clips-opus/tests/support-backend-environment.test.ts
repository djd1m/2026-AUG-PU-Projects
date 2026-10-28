import {describe,it,expect} from 'vitest';
import path from 'node:path';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {tmpdir} from 'node:os';
import {readEnvironment} from '../apps/web/src/server/environment';
import {collectEnvironment} from '../scripts/check-env-wiring.mjs';
import {loadMailConfig,loadSupportConfig} from '../packages/shared/src/support-config';
describe('support runtime isolation and wiring',()=>{
 it('Resend requires only selected key and sender, with no implicit enablement',()=>{
  const valid={N5_MAIL_MODE:'resend',N5_RESEND_API_KEY:'synthetic-key',N5_MAIL_FROM:'Sender <sender@example.test>'};
  expect(loadMailConfig(valid)).toMatchObject({mode:'resend',apiKey:'synthetic-key',from:valid.N5_MAIL_FROM});
  expect(loadMailConfig({N5_RESEND_API_KEY:'synthetic-key'}).mode).toBe('disabled');
  for(const value of [undefined,'',' ','key\nsecret','key secret'])expect(()=>loadMailConfig({...valid,N5_RESEND_API_KEY:value})).toThrow();
  for(const value of [undefined,'','sender','sender@example.test\r\nBcc: victim@example.test'])expect(()=>loadMailConfig({...valid,N5_MAIL_FROM:value})).toThrow();
 });
 it('Resend key is explicitly server-read and wired only to web',async()=>{
  expect(collectEnvironment(['apps/web/src/server/environment.ts'],process.cwd()).has('N5_RESEND_API_KEY')).toBe(true);
  expect(Object.hasOwn(readEnvironment(),'N5_RESEND_API_KEY')).toBe(true);
  const compose=await readFile('docker-compose.yml','utf8');
  expect(compose.match(/N5_RESEND_API_KEY/g)).toHaveLength(2);
  const web=compose.slice(compose.indexOf('  web:'),compose.indexOf('  worker-stt:'));
  expect(web).toContain('N5_RESEND_API_KEY: ${N5_RESEND_API_KEY-}');
 });
 it('test mail/support require runtime test plus *_test database',()=>{
  for(const database of [undefined,'postgresql://synthetic@localhost/n5_live']) {
   expect(()=>loadMailConfig({NODE_ENV:'test',DATABASE_URL:database,N5_MAIL_MODE:'test'})).toThrow();
   expect(()=>loadSupportConfig({NODE_ENV:'test',DATABASE_URL:database,N5_SUPPORT_MODE:'test'})).toThrow();
  }
  expect(loadMailConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://synthetic@localhost/n5_test',N5_MAIL_MODE:'test'}).mode).toBe('test');
 });
 it('runtime NODE_ENV Reflect.get remains visible to the environment wiring guard',()=>{
  expect(collectEnvironment(['apps/web/src/server/environment.ts'],process.cwd()).has('NODE_ENV')).toBe(true);
 });
 it('production DefinePlugin bundle reads runtime mode and still rejects production test mail',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'n5-support-env-bundle-test-'));
  try {
   const entry=path.join(directory,'environment.js'),bundle=path.join(directory,'bundle.cjs');
   const source=await readFile('apps/web/src/server/environment.ts','utf8');
   await writeFile(entry,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText);
   const nextWebpack=createRequire(import.meta.url)('next/dist/compiled/webpack/webpack') as {
    init():void;webpack:((options:object,callback:(error:Error|null,stats:{hasErrors():boolean;toString():string})=>void)=>void)&{DefinePlugin:new(options:object)=>object}
   };
   nextWebpack.init();
   await new Promise<void>((resolve,reject)=>nextWebpack.webpack({mode:'production',target:'node',entry,optimization:{minimize:false},
    output:{path:directory,filename:'bundle.cjs',library:{type:'commonjs2'}},
    plugins:[new nextWebpack.webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('production')})]},
    (error,stats)=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString())):resolve()));
   const validator=path.resolve('packages/shared/dist/support-config.js');
   const probe=`try{const env=require(${JSON.stringify(bundle)}).readEnvironment();require(${JSON.stringify(validator)}).loadMailConfig(env);process.stdout.write(env.NODE_ENV);}catch{process.exit(23);}`;
   for(const [mode,status] of [['test',0],['production',23]] as const) {
    const result=spawnSync(process.execPath,['-e',probe],{encoding:'utf8',env:{...process.env,NODE_ENV:mode,N5_MAIL_MODE:'test',DATABASE_URL:'postgresql://synthetic@localhost/n5_test'}});
    expect(result.status).toBe(status);if(mode==='test')expect(result.stdout).toBe('test');
   }
  }finally{await rm(directory,{recursive:true,force:true});}
 });
 it('const aliases still reject computed/dynamic env access',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'n5-support-env-test-'));
  try {
   await writeFile(path.join(directory,'ok.ts'),'const runtime=process.env; export const mode=runtime.NODE_ENV;');
   expect([...collectEnvironment(['ok.ts'],directory)]).toEqual(['NODE_ENV']);
   await writeFile(path.join(directory,'reflect.ts'),"export const mode=Reflect.get(process.env,'NODE_ENV');");
   expect([...collectEnvironment(['reflect.ts'],directory)]).toEqual(['NODE_ENV']);
   await writeFile(path.join(directory,'reflect-bad.ts'),"const key='NODE_ENV'; export const mode=Reflect.get(process.env,key);");
   expect(()=>collectEnvironment(['reflect-bad.ts'],directory)).toThrow('Динамическое');
   await writeFile(path.join(directory,'bad.ts'),'const runtime=process.env; const key="NODE_ENV"; export const mode=runtime[key];');
   expect(()=>collectEnvironment(['bad.ts'],directory)).toThrow('Динамическое');
  }finally{await rm(directory,{recursive:true,force:true});}
 });
});
