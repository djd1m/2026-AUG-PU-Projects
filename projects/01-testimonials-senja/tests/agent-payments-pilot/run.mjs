import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { browser } from './browser.mjs';
import { clients } from './clients.mjs';
import { identity } from './identity.mjs';
import { purchase, settle, mandate, revoke } from './payments.mjs';
import { inspect, pay } from './hosted.mjs';
const tests = dirname(fileURLToPath(import.meta.url)), evidence = join(tests, 'evidence');
const phase = process.argv[2]; assert.ok(['identity', 'purchase', 'inspect', 'pay', 'settle', 'mandate', 'revoke', 'close'].includes(phase));
assert.equal(process.env.PILOT_READY, 'true', 'Coordinator must declare the dedicated public pilot ready');
assert.equal(process.env.PILOT_TEST_SHOP_CONFIRMED, 'true', 'Coordinator must independently verify provider account is TEST');
const statePath = resolve(process.env.PILOT_UI_STATE || '/tmp/agent-payments-public-pilot/state.json');
assert.ok(statePath.startsWith('/tmp/'), 'Private state must stay outside source tree');
const runtime = dirname(statePath); await mkdir(runtime, { recursive: true, mode: 0o700 });
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const id = randomUUID(); state = { webOrigin: 'https://proofwall-agent.212.192.0.33.sslip.io', gatewayOrigin: 'https://proofwall-mcp.212.192.0.33.sslip.io',
    email: `delivered+agent-pilot-${id}@resend.dev`, password: `Public TEST ${randomUUID()}!`, slug: 'agent-pilot-' + id.slice(0, 8), records: [], createdAt: new Date().toISOString() };
}
assert.equal(state.webOrigin, 'https://proofwall-agent.212.192.0.33.sslip.io');
assert.equal(state.gatewayOrigin, 'https://proofwall-mcp.212.192.0.33.sslip.io');
async function save() { await writeFile(statePath + '.tmp', JSON.stringify(state), { mode: 0o600 }); await rename(statePath + '.tmp', statePath); }
await save();
function redact(value) { return String(value).replace(/[A-Za-z0-9_+\/=\-]{43,}/g, '[redacted]').replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted card]'); }
function record(name, detail = {}) { if (!state.records.some(x => x.name === name)) state.records.push({ name, status: 'PASS', at: new Date().toISOString(), ...detail }); console.log('PASS ' + name); }
async function evidenceWrite(status, error) {
  const result = { status, phase, at: new Date().toISOString(), webOrigin: state.webOrigin, gatewayOrigin: state.gatewayOrigin,
    records: state.records, orderId: state.order?.orderId, renewalOrderId: state.renewal?.orderId, slug: state.slug,
    flags: { registered: !!state.registered, emailVerified: !!state.verified, grantIssued: !!state.token, hostedStarted: !!state.hostedStarted, settled: !!state.settled, renewed: !!state.renewed, revoked: !!state.revoked },
    ...(error ? { error: redact(error.message) } : {}) };
  await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, phase + '.json'), JSON.stringify(result, null, 2) + '\n');
}
try {
  const b = await browser(state, save, runtime, evidence);
  const c = clients(process.env.PILOT_MAIN_SOURCE, state);
  if (phase === 'close') { await b.close(); await evidenceWrite('PASS'); }
  else {
    const result = await ({ identity, purchase, inspect, pay, settle, mandate, revoke }[phase])({ state, save, b, c, record });
    await save(); await evidenceWrite('PASS'); if (result) console.log(redact(JSON.stringify(result)));
  }
} catch (error) { await save(); await evidenceWrite('FAIL', error); console.error(redact(error.stack)); process.exitCode = 1; }
console.log('Private checkpoint: ' + statePath);
