import { readFile } from 'node:fs/promises';
import { N3, PROVIDER, MAIL, socket, socketFetch, required } from './tls.mjs';

const role = required('BRIDGE_ROLE');
if (!['p1', 'n3'].includes(role)) throw new Error('Unknown bridge role');
const routes = new Map([[PROVIDER, { socket: socket('providers'), allow: path => /^\/v3\/(payments|refunds)(\/[^/]+)?$/.test(path) }]]);
if (role === 'p1') {
  routes.set(MAIL, { socket: socket('providers'), allow: path => path === '/emails' });
  routes.set(N3, { socket: socket('n3'), allow: path => /^\/api\/integration\/(customers|external-orders|external-events|order)$/.test(path) });
}
globalThis.fetch = socketFetch({ ca: await readFile(required('BRIDGE_CA')), routes, role });
