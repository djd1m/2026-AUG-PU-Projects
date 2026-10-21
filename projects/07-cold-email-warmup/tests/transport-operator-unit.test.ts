import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config } from '../src/config.js';
import type { createPool } from '../src/db.js';
import { HttpError } from '../src/errors.js';
import { readPrivateFile, runTransportOperator, type OperatorDependencies } from '../src/mailboxes/transport-operator.js';
const tenant = randomUUID(), mailbox = randomUUID(), token = 'PRIVATE_TOKEN_CANARY';
const config = { databaseUrl: 'private-db', operatorTokenDigest: createHash('sha256').update(token).digest() } as Config;
function fixture(options: { readFailure?: boolean; raw?: string; token?: string; ready?: boolean; publishError?: Error; cleanupError?: boolean } = {}) {
 let ended = 0, published = 0, opened = 0; let raw: unknown; const stdout: string[] = [], stderr: string[] = [];
 const dependencies: OperatorDependencies = {
  loadConfig: () => config,
  createPool: () => { opened++; return { end: async () => { ended++; if (options.cleanupError) throw new Error('PRIVATE_DB_CANARY'); } } as unknown as ReturnType<typeof createPool>; },
  ready: async () => options.ready ?? true,
  read: async (file, limit) => { if (file === 'token') return options.token ?? token; assert.equal(limit, 16384); if (options.readFailure) throw new Error('PRIVATE_PATH_CANARY'); return options.raw ?? '{"scope":"transport"}'; },
  publish: async (_pool, _config, _token, _tenant, _mailbox, _expected, value) => { published++; raw = value; if (options.publishError) throw options.publishError; return '7'; },
 };
 const run = (args = ['publish', tenant, mailbox, '0', 'grant'], env: NodeJS.ProcessEnv = { OPERATOR_TOKEN_FILE: 'token' }) => runTransportOperator(args, env, dependencies, { stdout: text => stdout.push(text), stderr: text => stderr.push(text) });
 return { run, stdout, stderr, get ended() { return ended; }, get opened() { return opened; }, get published() { return published; }, get raw() { return raw; } };
}
test('operator publish/revoke exact arguments and opaque revision; pool cleanup', async () => {
 const f = fixture(); assert.equal(await f.run(), 0); assert.deepEqual(f.raw, { scope: 'transport' }); assert.equal(f.ended, 1); assert.deepEqual(f.stdout, ['{"revision":"7"}\n']);
 const revoke = fixture(); assert.equal(await revoke.run(['revoke', tenant, mailbox, '2']), 0); assert.equal(revoke.raw, null);
 for (const args of [[], ['publish', tenant, mailbox, '0'], ['revoke', tenant, mailbox, '0', 'extra'], ['publish', 'bad', mailbox, '0', 'grant'], ['publish', tenant, mailbox, '-1', 'grant']]) { const bad = fixture(); assert.equal(await bad.run(args), 1); assert.equal(bad.published, 0); assert.equal(bad.opened, 0); }
});
test('invalid private input reaches publisher to commit revoke before typed failure', async () => {
 for (const options of [{ readFailure: true }, { raw: '{PRIVATE_INPUT_CANARY' }, { raw: 'null' }]) {
  const f = fixture({ ...options, publishError: new HttpError(400, 'invalid_transport_grant') });
  assert.equal(await f.run(), 1); assert.equal(f.published, 1); assert.deepEqual(f.raw, {}); assert.equal(f.ended, 1); assert.deepEqual(f.stdout, []); assert.deepEqual(f.stderr, ['invalid_input_authority_revoked\n']);
 }
});
test('bad authentication and readiness never reach publisher; errors hide private content', async () => {
 const denied = fixture({ token: 'WRONG_PRIVATE_TOKEN' }); assert.equal(await denied.run(), 1); assert.equal(denied.published, 0); assert.equal(denied.opened, 0); assert.deepEqual(denied.stderr, ['operator_denied\n']);
 const missing = fixture(); assert.equal(await missing.run(undefined, {}), 1); assert.equal(missing.published, 0);
 const unready = fixture({ ready: false }); assert.equal(await unready.run(), 1); assert.equal(unready.published, 0); assert.equal(unready.ended, 1);
 for (const error of [new Error('PRIVATE_DB_CANARY'), new HttpError(409, 'authority_changed'), new HttpError(404, 'not_found')]) { const f = fixture({ publishError: error }); assert.equal(await f.run(), 1); assert.equal(f.ended, 1); assert.ok(!f.stderr.join('').includes('PRIVATE')); }
 const cleanup = fixture({ cleanupError: true }); assert.equal(await cleanup.run(), 1); assert.equal(cleanup.ended, 1); assert.ok(!cleanup.stderr.join('').includes('PRIVATE'));
});
test('private reader accepts exactly 16KiB and rejects oversized or missing files', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'n7-operator-unit-'));
 try { const path = join(dir, 'grant'); await writeFile(path, 'x'.repeat(16384), { mode: 0o600 }); assert.equal((await readPrivateFile(path, 16384)).length, 16384); await writeFile(path, 'x'.repeat(16385)); await assert.rejects(readPrivateFile(path, 16384)); await assert.rejects(readPrivateFile(join(dir, 'missing'), 16384)); await assert.rejects(readPrivateFile(dir, 16384)); } finally { await rm(dir, { recursive: true }); }
});

// Supervise in a child so the blocking-open mutation fails within the bound and is joined.
test('no-writer FIFO promptly commits invalid-input publication and closes pool', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'n7-operator-fifo-')), fifo = join(dir, 'private-grant');
 const execute = promisify(execFile);
 try {
  await execute('mkfifo', ['-m', '600', fifo]);
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/mailboxes/transport-operator.ts')).href;
  const script = `
   import {createHash} from 'node:crypto';
   import {runTransportOperator,readPrivateFile} from ${JSON.stringify(moduleUrl)};
   import {HttpError} from ${JSON.stringify(new URL('../src/errors.ts', import.meta.url).href)};
   const token='fake-private-token';let published=0,ended=0,raw;const stdout=[],stderr=[];
   const dependencies={loadConfig:()=>({databaseUrl:'fake-db',operatorTokenDigest:createHash('sha256').update(token).digest()}),createPool:()=>({end:async()=>{ended++;}}),ready:async()=>true,read:async(file,limit)=>file==='token'?token:readPrivateFile(file,limit),publish:async(_p,_c,_t,_tenant,_box,_rev,value)=>{published++;raw=value;throw new HttpError(400,'invalid_transport_grant');}};
   const status=await runTransportOperator(['publish','${tenant}','${mailbox}','0',process.argv[1]],{OPERATOR_TOKEN_FILE:'token'},dependencies,{stdout:text=>stdout.push(text),stderr:text=>stderr.push(text)});
   process.stdout.write(JSON.stringify({status,published,ended,raw,stdout,stderr}));
  `;
  const { stdout } = await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, fifo], { timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 4096 });
  assert.deepEqual(JSON.parse(stdout), { status: 1, published: 1, ended: 1, raw: {}, stdout: [], stderr: ['invalid_input_authority_revoked\n'] });
 } finally { await rm(dir, { recursive: true }); }
});
