// Local E2E harness: real PDF/indexing/lease pipeline, deterministic provider, no external requests.
import { createPool } from './packages/db/dist/index.js';
import { constructGateway } from './packages/rag/dist/paid-call.js';
import { FakeProvider } from './packages/rag/dist/provider/fake.js';
import { createPdfExtractor } from './services/worker/dist/pdf/extract.js';
import { createIndexRunner } from './services/worker/dist/index-runner.js';
import { startWorker } from './services/worker/dist/loop.js';
const pool=createPool(process.env.DATABASE_URL_SERVICE,'DATABASE_URL_SERVICE');
const gateway=constructGateway({pool,provider:new FakeProvider(),limits:{answerVisitorDay:20,answerBotDay:200,answerGlobalDay:1000,sandboxAccountDay:20,sandboxGlobalDay:200,embedTokensAccountDay:100000,embedTokensGlobalDay:1000000}});
const worker=startWorker({pool,runner:createIndexRunner({pool,gateway,extractors:{pdf:createPdfExtractor({pool})}})});
process.on('SIGTERM',()=>void worker.stop().then(()=>pool.end()).then(()=>process.exit(0)));
console.log('PDF UI fixture worker started with real lease/extraction and deterministic model provider');
