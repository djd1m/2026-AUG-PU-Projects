import {describe,it,expect} from 'vitest';
import path from 'node:path';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {collectEnvironment} from '../scripts/check-env-wiring.mjs';
import {loadMailConfig,loadSupportConfig} from '../packages/shared/src/support-config';
describe('support runtime isolation and wiring',()=>{
 it('test mail/support require runtime test plus *_test database',()=>{
  for(const database of [undefined,'postgresql://synthetic@localhost/n5_live']) {
   expect(()=>loadMailConfig({NODE_ENV:'test',DATABASE_URL:database,N5_MAIL_MODE:'test'})).toThrow();
   expect(()=>loadSupportConfig({NODE_ENV:'test',DATABASE_URL:database,N5_SUPPORT_MODE:'test'})).toThrow();
  }
  expect(loadMailConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://synthetic@localhost/n5_test',N5_MAIL_MODE:'test'}).mode).toBe('test');
 });
 it('runtime NODE_ENV alias remains visible to the environment wiring guard',()=>{
  expect(collectEnvironment(['apps/web/src/server/environment.ts'],process.cwd()).has('NODE_ENV')).toBe(true);
 });
 it('const aliases still reject computed/dynamic env access',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'n5-support-env-test-'));
  try {
   await writeFile(path.join(directory,'ok.ts'),'const runtime=process.env; export const mode=runtime.NODE_ENV;');
   expect([...collectEnvironment(['ok.ts'],directory)]).toEqual(['NODE_ENV']);
   await writeFile(path.join(directory,'bad.ts'),'const runtime=process.env; const key="NODE_ENV"; export const mode=runtime[key];');
   expect(()=>collectEnvironment(['bad.ts'],directory)).toThrow('Динамическое');
  }finally{await rm(directory,{recursive:true,force:true});}
 });
});
