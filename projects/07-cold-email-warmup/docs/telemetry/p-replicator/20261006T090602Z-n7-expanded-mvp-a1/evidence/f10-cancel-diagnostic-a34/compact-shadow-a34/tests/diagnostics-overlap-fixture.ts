import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { DiagnosticStore } from '../src/mailboxes/diagnostic-store.js';
import { protocolFixture } from './diagnostics-fixture.js';
const config=loadConfig(),pool=createPool(config.databaseUrl),fixture=await protocolFixture();
try{const [tenant,id]=process.argv.slice(2);if(!tenant||!id)throw new Error();await new DiagnosticStore(pool,config.credentialKeyring,config.providerAllowlist,fixture.connector,'protocol_fixture').run(tenant,id,new AbortController().signal);process.stdout.write('overlap_completed\n');}finally{await fixture.close();await pool.end();}
