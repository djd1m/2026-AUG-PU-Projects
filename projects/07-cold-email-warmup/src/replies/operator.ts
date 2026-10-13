import { readFile,stat } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { seedFixture,type FixtureInput } from './fixture.js';
import { ReplyStore } from './store.js';
import { PollWorker,identity } from './worker.js';
// Process/file access is operator authority; no browser or tenant HTTP equivalent.
const config=loadConfig(),pool=createPool(config.databaseUrl);
try {
 if(config.pollMode!=='local_test' || !await ready(pool)) throw new Error();
 const [action,tenant,mailbox,file]=process.argv.slice(2);
 if(!tenant || !mailbox || !/^[0-9a-f-]{36}$/i.test(tenant) || !/^[0-9a-f-]{36}$/i.test(mailbox)) throw new Error();
 if(action==='seed' && file) {
  if((await stat(file)).size>16777216) throw new Error();
  await seedFixture(pool,tenant,mailbox,JSON.parse(await readFile(file,'utf8')) as FixtureInput);
 } else if(action==='retry') {
  const store=new ReplyStore(pool,config.credentialKeyring),run=await store.status(tenant,mailbox);if(!run) throw new Error();
  await store.retry(tenant,mailbox,identity(run));
 } else if(action==='poll') await new PollWorker(pool,config.credentialKeyring,'local_test').poll(tenant,mailbox);
 else throw new Error();
 process.stdout.write('operator_action_complete\n');
} catch {process.stderr.write('operator_action_failed\n');process.exitCode=1;} finally {await pool.end();}
