import { createAgentHandler } from '../../shared/agents/index.mjs';
import { originsFor } from '../../shared/contracts/deployment.mjs';
import { readFileSync } from 'node:fs';
import { createApplication } from '../../shared/application/index.mjs';
import { createHttpServer } from './http.mjs';
import { readAccessConfig } from '../../shared/identity/access-config.mjs';

const mode=process.env.N3_MODE;
if (!['fixture','hybrid','real'].includes(mode)) throw new Error('Explicit N3_MODE is required.');
const yookassaConfig=process.env.N3_YOOKASSA_CONFIG_FILE ? JSON.parse(readFileSync(process.env.N3_YOOKASSA_CONFIG_FILE,'utf8')) : {enabled:false};
const accessConfig=readAccessConfig(process.env.N3_ACCESS_CONFIG_FILE);
const passwordFile = process.env.PGPASSWORD_FILE;
if (!passwordFile) throw new Error('PGPASSWORD_FILE secret is required.');
const password = readFileSync(passwordFile, 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('A generated 256-bit database password is required.');
// File secrets remain0600 on host; drop root immediately after reading them.
if (process.getuid?.() === 0) { process.setgid(1000); process.setuid(1000); }
const app = await createApplication({ mode, yookassaConfig, accessConfig, database: {
  host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE, user: process.env.PGUSER, password,
  max: 8, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
} });
const handlers=new Map(['A','B','C','D'].flatMap(v=>originsFor(v).map(origin=>[origin,createAgentHandler({...app,origin})])));
const canonical=originsFor('D').find(origin=>origin.startsWith('https:'));
const agentHandler=(req,res,path)=>{
  if (!['/mcp','/a2a','/.well-known/agent-card.json'].includes(path)) return false;
  const handler=handlers.get(req.headers.origin ?? canonical);
  if (!handler) { res.writeHead(403); res.end(); return true; }
  return handler(req,res,path);
};
const server = createHttpServer(app,{mode,agentHandler});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('N3 API ready'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await app.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
