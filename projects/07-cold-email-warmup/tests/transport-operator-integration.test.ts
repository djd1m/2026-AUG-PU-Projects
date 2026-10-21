import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createPool, migrate } from '../src/db.js';
import { publishTransportGrant, transportFingerprint } from '../src/mailboxes/transport-authority.js';
import { runTransportOperator } from '../src/mailboxes/transport-operator.js';

test('private CLI committed invalid revoke, tenant isolation, CAS concurrency and cancellation', async () => {
 const config = loadConfig(), pool = createPool(config.databaseUrl), tenants = [randomUUID(), randomUUID()], boxes = [randomUUID(), randomUUID()];
 const dir = await mkdtemp(join(tmpdir(), 'n7-operator-pg-')), grantPath = join(dir, 'grant');
 let owned = false;
 const token = (await readFile(process.env.OPERATOR_TOKEN_FILE!, 'utf8')).trim();
 const metadata = { smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993 };
 const grant = (i: number) => ({ scope: 'transport', tenant: tenants[i], mailbox: boxes[i], capabilities: ['smtp_submit', 'imap_headers'], ...metadata, mailboxTransportRevision: '0', configFingerprint: transportFingerprint(config.providerAllowlist), expiresAt: new Date(Date.now() + 600000).toISOString() });
 const output = { stdout: (_text: string) => {}, stderr: (_text: string) => {} };
 const cli = (tenant: string, mailbox: string, expected: string, file: string) => runTransportOperator(['publish', tenant, mailbox, expected, file], process.env, undefined, output);
 const state = async (i: number) => (await pool.query('SELECT revision,state FROM transport_grant WHERE tenant_id=$1 AND mailbox_id=$2', [tenants[i], boxes[i]])).rows[0];
 try {
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'n7_live_mail_ops_a1_20261007');
  owned = true;
  await migrate(pool);
  for (let i = 0; i < 2; i++) {
   await pool.query('INSERT INTO tenant(id) VALUES($1)', [tenants[i]]);
   await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,metadata) VALUES($1,$2,$3,'verified_test',$4)", [boxes[i], tenants[i], 'n7-operator-' + boxes[i], metadata]);
   await pool.query('INSERT INTO mailbox_poll(mailbox_id,scan_complete) VALUES($1,true)', [boxes[i]]);
   assert.equal(await publishTransportGrant(pool, config, token, tenants[i]!, boxes[i]!, '0', grant(i)), '1');
  }
  // Authority/ID/CAS errors leave both previously active grants intact.
  await assert.rejects(publishTransportGrant(pool, config, 'wrong-private-token', tenants[0]!, boxes[0]!, '1', {}), { code: 'operator_denied' });
  assert.equal(await cli(tenants[1]!, boxes[0]!, '1', join(dir, 'missing')), 1);
  assert.equal(await cli(tenants[0]!, boxes[0]!, '0', join(dir, 'missing')), 1);
  assert.deepEqual(await state(0), { revision: '1', state: 'active' }); assert.deepEqual(await state(1), { revision: '1', state: 'active' });
  // Both sender and recipient jobs cancel; unrelated mailbox jobs remain queued.
  for (const [sender, recipient, jobState] of [[0, 1, 'queued'], [1, 0, 'claimed'], [1, null, 'queued']] as const) {
   await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state) VALUES($1,$2,$3,$4,'pool',$5)", [randomUUID(), tenants[sender], boxes[sender], recipient === null ? null : boxes[recipient], jobState]);
  }
  await pool.query('UPDATE mailbox_poll SET scan_complete=true WHERE mailbox_id=ANY($1::uuid[])', [boxes]);
  assert.equal(await cli(tenants[0]!, boxes[0]!, '1', join(dir, 'missing')), 1);
  assert.deepEqual(await state(0), { revision: '2', state: 'revoked' }); assert.deepEqual(await state(1), { revision: '1', state: 'active' });
  assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1', [boxes[0]])).rows[0].scan_complete, false);
  assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1', [boxes[1]])).rows[0].scan_complete, true);
  assert.deepEqual((await pool.query('SELECT state FROM send_job WHERE mailbox_id=$1 OR recipient_mailbox_id=$1', [boxes[0]])).rows.map(r => r.state), ['cancelled', 'cancelled']);
  assert.equal((await pool.query('SELECT state FROM send_job WHERE mailbox_id=$1 AND recipient_mailbox_id IS NULL', [boxes[1]])).rows[0].state, 'queued');
  // Each failure commits revocation even when a previous grant is active.
  let revision = 2;
  for (const contents of ['{invalid-private-json', 'x'.repeat(16385), 'null', '{}']) {
   await publishTransportGrant(pool, config, token, tenants[0]!, boxes[0]!, String(revision++), grant(0));
   await writeFile(grantPath, contents, { mode: 0o600 });
   assert.equal(await cli(tenants[0]!, boxes[0]!, String(revision++), grantPath), 1);
   assert.deepEqual(await state(0), { revision: String(revision), state: 'revoked' });
  }
  await writeFile(grantPath, JSON.stringify(grant(0)), { mode: 0o600 });
  const results = await Promise.all([cli(tenants[0]!, boxes[0]!, String(revision), grantPath), cli(tenants[0]!, boxes[0]!, String(revision), grantPath)]);
  assert.deepEqual(results.sort(), [0, 1]); assert.deepEqual(await state(0), { revision: String(revision + 1), state: 'active' });
 } finally {
  // Cleanup is restricted to this test's random IDs; no reset/truncate/drop.
  if (owned) {
  await pool.query('DELETE FROM send_job WHERE tenant_id=ANY($1::uuid[])', [tenants]);
  await pool.query('DELETE FROM transport_grant WHERE tenant_id=ANY($1::uuid[])', [tenants]);
  await pool.query('DELETE FROM mailbox_poll WHERE mailbox_id=ANY($1::uuid[])', [boxes]);
  await pool.query('DELETE FROM mailbox WHERE tenant_id=ANY($1::uuid[])', [tenants]);
  await pool.query('DELETE FROM tenant WHERE id=ANY($1::uuid[])', [tenants]);
  }
  await pool.end(); await rm(dir, { recursive: true });
 }
});
