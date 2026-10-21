import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool, ready } from '../db.js';
import { HttpError } from '../errors.js';
import { operatorCapability, publishTransportGrant } from './transport-authority.js';

// Local privileged CLI only; grant publication never starts a campaign.
export async function readPrivateFile(file: string, limit: number): Promise<string> {
 const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
 try {
  if (!(await handle.stat()).isFile()) throw new Error('private_input_invalid');
  const buffer = Buffer.alloc(limit + 1);
  let used = 0;
  while (used < buffer.length) {
   const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
   if (!bytesRead) break;
   used += bytesRead;
  }
  if (used > limit) throw new Error('private_input_invalid');
  return buffer.subarray(0, used).toString('utf8');
 } finally { await handle.close(); }
}
export interface OperatorDependencies {
 loadConfig: typeof loadConfig;
 createPool: typeof createPool;
 ready: typeof ready;
 read: typeof readPrivateFile;
 publish: typeof publishTransportGrant;
}
const defaults: OperatorDependencies = { loadConfig, createPool, ready, read: readPrivateFile, publish: publishTransportGrant };
const uuid = (value: string | undefined) => !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function runTransportOperator(
 argv: string[], env: NodeJS.ProcessEnv = process.env,
 dependencies: OperatorDependencies = defaults,
 output: { stdout: (text: string) => void; stderr: (text: string) => void } = { stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text) },
): Promise<number> {
 let pool: ReturnType<typeof createPool> | undefined;
 let status = 1;
 try {
  const [action, tenant, mailbox, expected, file] = argv;
  if (!['publish', 'revoke'].includes(action ?? '') || argv.length !== (action === 'publish' ? 5 : 4) || !uuid(tenant) || !uuid(mailbox) || !expected || !/^(0|[1-9]\d{0,18})$/.test(expected)) throw new HttpError(400, 'invalid_operator_arguments');
  const config = dependencies.loadConfig(env);
  if (!env.OPERATOR_TOKEN_FILE) throw new HttpError(403, 'operator_denied');
  const token = (await dependencies.read(env.OPERATOR_TOKEN_FILE, 1024)).trim();
  operatorCapability(config, token);
  pool = dependencies.createPool(config.databaseUrl);
  if (!await dependencies.ready(pool)) throw new HttpError(503, 'operator_not_ready');
  let raw: unknown = null;
  if (action === 'publish') {
   try { raw = JSON.parse(await dependencies.read(file!, 16384)); }
   catch { raw = {}; } // Publisher commits invalid-input revocation before throwing.
   // JSON null is invalid publish input, not an implicit revoke success.
   if (raw === null) raw = {};
  }
  const revision = await dependencies.publish(pool, config, token, tenant!, mailbox!, expected, raw);
  output.stdout(JSON.stringify({ revision }) + '\n');
  status = 0;
 } catch (error) {
  const safe = error instanceof HttpError && ['invalid_operator_arguments', 'operator_denied', 'operator_not_ready', 'authority_changed', 'not_found', 'invalid_transport_grant'].includes(error.code) ? error.code : 'transport_operator_failed';
  output.stderr((safe === 'invalid_transport_grant' ? 'invalid_input_authority_revoked' : safe) + '\n');
 } finally {
  if (pool) try { await pool.end(); } catch { output.stderr('authority_cleanup_failed\n'); status = 1; }
 }
 return status;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 process.exitCode = await runTransportOperator(process.argv.slice(2));
}
