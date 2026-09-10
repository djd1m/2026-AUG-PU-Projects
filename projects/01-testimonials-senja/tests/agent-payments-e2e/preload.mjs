import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROVIDER, MAIL, root, socket, localFetch } from './network.mjs';
if (process.env.AGENT_E2E_ISOLATED !== 'true') throw Error('Explicit isolated fixture mode required');
const routes = new Map([
  [PROVIDER, { socket: socket('provider'), allow: p => /^\/v3\/(payments|refunds)(\/[^/]+)?$/.test(p) }],
  [MAIL, { socket: socket('provider'), allow: p => p === '/emails' }],
]);
globalThis.fetch = localFetch(routes, await readFile(join(root(), 'fixture.crt')));
