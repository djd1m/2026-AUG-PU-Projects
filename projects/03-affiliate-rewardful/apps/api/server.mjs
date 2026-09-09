import { readFileSync } from 'node:fs';
import { createApplication } from '../../shared/application/index.mjs';
import { createHttpServer } from './http.mjs';

if (process.env.N3_MODE !== 'fixture') throw new Error('N3_MODE=fixture is required; production is not implemented.');
const passwordFile = process.env.PGPASSWORD_FILE;
if (!passwordFile) throw new Error('PGPASSWORD_FILE secret is required.');
const password = readFileSync(passwordFile, 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('A generated 256-bit database password is required.');
// File secrets remain0600 on host; drop root immediately after reading them.
if (process.getuid?.() === 0) { process.setgid(1000); process.setuid(1000); }
const app = await createApplication({ database: {
  host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE, user: process.env.PGUSER, password,
  max: 8, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
} });
const server = createHttpServer(app);
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('N3 fixture API ready'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await app.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
