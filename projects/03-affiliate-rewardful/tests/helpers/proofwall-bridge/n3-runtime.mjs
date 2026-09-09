import { createServer } from 'node:https';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { P1, N3, required, socket, tlsConfig, listenSocket, json, closeServer } from './tls.mjs';

const source = process.env.BRIDGE_N3_SOURCE || '/app';
const moduleAt = path => import(pathToFileURL(`${source}/${path}`));
const { createApplication } = await moduleAt('shared/application/index.mjs');
const { createHttpServer } = await moduleAt('apps/api/http.mjs');
const { createFrontendServer } = await moduleAt('apps/frontend/server.mjs');
const output = required('BRIDGE_OUTPUT_DIR');
await mkdir(output, { recursive: true, mode: 0o700 });
const config = { enabled: false, shopId: required('YOOKASSA_SHOP_ID'), secretKey: required('YOOKASSA_SECRET_KEY'),
  testMode: true, returnUrl: `${P1}/dashboard` };
const schema = `n3_test_bridge_${randomUUID().replaceAll('-', '')}`;
const options = { mode: 'real', schema, clock: Date.now, yookassaConfig: config };
let app = await createApplication(options);
const password = `Bridge only ${randomUUID()}!`;
const ownerEmail = `owner-${randomUUID()}@example.test`, partnerEmail = `partner-${randomUUID()}@example.test`;
const register = email => app.identity.register({ email, password, name: 'Bridge browser test' });
const owner = await register(ownerEmail), partner = await register(partnerEmail);
config.tenantId = (await app.identity.me(owner.token)).memberships[0].tenantId;
config.enabled = true; await app.close(); app = await createApplication(options);
const invite = await app.identity.invite(owner.token, owner.membershipId, { role: 'partner' });
const joined = await app.identity.acceptInvite(partner.token, { invitation: invite.invitation, name: 'Bridge partner' });
const command = (action, input = {}) => app.executeReal(owner.token, owner.membershipId, action, input, randomUUID());
await command('program.save', { kind: 'cash', bps: 2000, windowDays: 30, holdDays: 30, recurring: true });
await app.executeReal(partner.token, joined.membershipId, 'enrollment.join', { consent: true }, randomUUID());
await app.referrals.configure(owner.token, owner.membershipId, { landingUrl: `${P1}/n3/start`, returnUrl: `${P1}/dashboard` });
const connectorKey = (await app.referrals.rotate(owner.token, owner.membershipId)).token;
const context = { tenantId: config.tenantId, ownerEmail, partnerEmail, password, partnerId: joined.actorId,
  partnerMembershipId: joined.membershipId, referralUrl: `${N3}/r/${joined.actorId}`, p1Origin: P1, n3Origin: N3 };
await writeFile(`${output}/bootstrap.json`, JSON.stringify({ ...context, connectorKey }), { mode: 0o600 });

const api = createHttpServer(app, { mode: 'real' });
await new Promise(resolve => api.listen(13030, '127.0.0.1', resolve));
const staticRoot = `${output}/frontend`;
await cp(`${source}/variants/a-merchant/app`, staticRoot, { recursive: true });
for (const name of ['client', 'ui', 'contracts']) await cp(`${source}/shared/${name}`, `${staticRoot}/shared/${name}`, { recursive: true });
const front = createFrontendServer({ staticRoot, apiOrigin: 'http://127.0.0.1:13030' });
await new Promise(resolve => front.listen(13031, '127.0.0.1', resolve));
const tls = await tlsConfig(); let paused = false;
const ingress = await listenSocket(createServer(tls, (req, res) => {
  if (req.headers.host !== new URL(N3).host) return json(res, { error: 'Harness host refused' }, 403);
  if (paused && req.url.startsWith('/api/integration/')) return json(res, { error: { code: 'UNAVAILABLE' } }, 503);
  const upstream = request({ hostname: '127.0.0.1', port: 13031, path: req.url, method: req.method, headers: req.headers, timeout: 15000 }, remote => {
    res.writeHead(remote.statusCode, remote.headers); remote.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) json(res, { error: 'N3 unavailable' }, 503); else res.destroy(); });
  req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
}), socket('n3'));
const control = await listenSocket(createServer(tls, async (req, res) => {
  if (req.headers.origin) return json(res, { error: 'Origin refused' }, 403);
  try {
    const url = new URL(req.url, N3);
    if (req.method === 'POST' && ['/pause', '/resume'].includes(url.pathname)) {
      paused = url.pathname === '/pause'; return json(res, { paused });
    }
    if (req.method !== 'GET' || url.pathname !== '/state') return json(res, { error: 'Not found' }, 404);
    const report = await command('dashboard'), status = await app.referrals.status(owner.token, owner.membershipId);
    const orderId = url.searchParams.get('orderId');
    const order = orderId ? await app.payments.connectorOrder(connectorKey, orderId) : null;
    json(res, { metrics: status.metrics, summary: report.summary, payments: report.payments,
      refunds: report.refunds, ledger: report.ledger, order });
  } catch { json(res, { error: 'N3 control failed' }, 503); }
}), socket('n3-control'));
await writeFile(`${output}/ready.json`, JSON.stringify({ schema, at: new Date().toISOString(), mode: 'real' }), { mode: 0o600 });
process.stdout.write('BRIDGE_N3_READY\n');
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await Promise.all([ingress, control, api, front].map(closeServer)); await app.close(); process.exit(0);
}
process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
