// Node22, no framework, no DB/network. Run: /tmp/n8-node22 <this file>.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const results = [];
let attemptedConnections = 0;
const connect = Socket.prototype.connect;
Socket.prototype.connect = function () { attemptedConnections++; throw new Error('OFFLINE_NETWORK_FORBIDDEN'); };
try {
  const b = await import('./nfr-200k.mjs');
  const test = async (name, fn) => { await fn(); results.push({ name, status: 'PASS' }); };
  const env = {
    NFR200K_OWNER_URL: 'postgresql://fixture_owner:aaaaaaaaaaaaaaaaaaaaaaaa@db/n6b_nfr200k_abcdefgh',
    NFR200K_SERVICE_URL: 'postgresql://n6b_app_service:bbbbbbbbbbbbbbbbbbbbbbbb@db/n6b_nfr200k_abcdefgh',
    NFR200K_RUNTIME_IDENTITY: JSON.stringify({ nodeImageDigest: `sha256:${'a'.repeat(64)}`,
      pgImageDigest: `sha256:${'b'.repeat(64)}`, cpuLimit: 2, hostCpuCount: 4, hostRamBytes: 16 * 1024 ** 3,
      diskFreeBytes: 8 * 1024 ** 3, diskTotalBytes: 20 * 1024 ** 3, neighborLoad: 'unknown' }),
    NFR200K_SOURCE_HASHES: '{}'
  };
  const args = ['--execute', '--owned-fixture', '--database=n6b_nfr200k_abcdefgh'];
  const cfg = b.parseArgs(args);
  await test('import and default control flow never reads credentials or connects', async () => {
    const result = await b.main([], new Proxy({}, { get() { throw new Error('ENV_READ'); } }));
    assert.equal(result.runtime, 'NOT_EXECUTED'); assert.equal(result.status, 'PREPARE_REFUSE_EXECUTION');
    assert.equal(attemptedConnections, 0);
  });
  await test('CLI rejects unknown/duplicate arguments, malformed limits and missing ownership', () => {
    for (const a of [['--wat'], ['--execute'], ['--owned-fixture'], ['--execute', '--execute'],
      ['--database=production'], ['--deadline-ms=1200001'], ['--deadline-ms='], ['--deadline-ms=NaN'],
      ['--offline-smoke=0'], ['--offline-smoke=101'], ['--execute', '--offline-smoke=5'],
      ['--execute', '--owned-fixture', '--database=n6b_nfr200k_']]) assert.throws(() => b.parseArgs(a));
    assert.equal(cfg.deadlineMs, 1140000);
    assert.equal(b.parseArgs(['--deadline-ms=1200000']).deadlineMs, 1200000);
  });
  await test('configuration requires exact private keys and separate local service login', () => {
    assert.equal(b.validateConfig(cfg, env).identity.cpuLimit, 2);
    for (const e of [{}, { ...env, NFR200K_WHATEVER: 'x' }, { ...env, NFR200K_OWNER_URL: '' },
      { ...env, NFR200K_OWNER_URL: 'postgres://wrong' },
      { ...env, NFR200K_SERVICE_URL: env.NFR200K_OWNER_URL },
      { ...env, NFR200K_SERVICE_URL: env.NFR200K_SERVICE_URL.replace('@db/', '@remote/') },
      { ...env, NFR200K_SERVICE_URL: env.NFR200K_SERVICE_URL.replace('abcdefgh', 'production') },
      { ...env, NFR200K_SERVICE_URL: `${env.NFR200K_SERVICE_URL}?options=unsafe` },
      { ...env, NFR200K_RUNTIME_IDENTITY: '{}' }, { ...env, NFR200K_SOURCE_HASHES: '[]' }])
      assert.throws(() => b.validateConfig(cfg, e));
    const identity = JSON.parse(env.NFR200K_RUNTIME_IDENTITY);
    for (const patch of [{ cpuLimit: 4 }, { diskFreeBytes: 5.5 * 1024 ** 3 }, { neighborLoad: '' }, { nodeImageDigest: 'latest' }])
      assert.throws(() => b.validateConfig(cfg, { ...env, NFR200K_RUNTIME_IDENTITY: JSON.stringify({ ...identity, ...patch }) }));
  });
  await test('execute rejects missing config and wrong source binding before any connection', async () => {
    await assert.rejects(b.main(args, {}), /MISSING_PRIVATE_CONFIG/);
    await assert.rejects(b.main(args, env), /SOURCE_HASH_MISMATCH/);
    assert.equal(attemptedConnections, 0);
  });
  await test('dense finite 1536 float32 vectors are deterministic, different and bounded', () => {
    const seen = new Set();
    for (const i of [0, 1, 19999, 20000, 199999, 200010]) {
      const v = b.vectorFor(i);
      assert.equal(v.length, 1536);
      assert.ok(v.every(x => Number.isFinite(x) && x !== 0 && x === Math.fround(x)));
      assert.deepEqual(v, b.vectorFor(i)); seen.add(JSON.stringify(v));
    }
    assert.equal(seen.size, 6); assert.notDeepEqual(b.vectorFor(0, 1), b.vectorFor(0, 2));
    for (const i of [-1, NaN, 201000, 1.5]) assert.throws(() => b.vectorFor(i));
  });
  await test('query schedule varies all ten bots and vectors; fixture identifiers/text obey format', () => {
    const queries = Array.from({ length: 30 }, (_, i) => b.queryFor(i));
    assert.equal(new Set(queries.map(q => q.botId)).size, 10);
    assert.equal(new Set(queries.map(q => JSON.stringify(q.vector))).size, 30);
    const ids = Array.from({ length: 10 }, (_, i) => b.botPublicId(i));
    assert.equal(new Set(ids).size, 10); assert.ok(ids.every(id => /^[A-Za-z0-9_-]{12}$/.test(id)));
    assert.notEqual(b.chunkText(0), b.chunkText(1));
    assert.equal(b.chunkText(0).length, b.chunkText(199999).length);
    assert.throws(() => b.botPublicId(10));
  });
  await test('ceil-rank statistics, singleton, ties, boundary and invalid samples', () => {
    assert.deepEqual(b.statistics([3]), { n: 1, p50: 3, p95: 3, p99: 3, max: 3 });
    assert.deepEqual(b.statistics([4, 1, 3, 2]), { n: 4, p50: 2, p95: 4, p99: 4, max: 4 });
    assert.equal(b.statistics(Array.from({ length: 20 }, (_, i) => 20 - i)).p95, 19);
    assert.equal(b.statistics([0, 0, 0]).p95, 0);
    for (const v of [[], [-1], [Infinity], [NaN], ['1']]) assert.throws(() => b.statistics(v));
  });
  await test('five owned hits accepted; wrong bot, duplicate/missing and invalid sim rejected', () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({ id: b.fixtureId(5, i),
      documentId: b.fixtureId(4, 0), text: b.chunkText(i), sim: .1 }));
    b.assertHits(hits, 0);
    assert.throws(() => b.assertHits(hits, 1));
    assert.throws(() => b.assertHits(hits.slice(1), 0));
    assert.throws(() => b.assertHits([hits[0], ...hits.slice(0, 4)], 0));
    assert.throws(() => b.assertHits([{ ...hits[0], sim: NaN }, ...hits.slice(1)], 0));
  });
  await test('natural HNSW guard rejects sequential and unrelated index plans', () => {
    assert.ok(b.hasHnsw({ 'Node Type': 'Limit', Plans: [{ 'Node Type': 'Index Scan', 'Index Name': 'chunk_embedding_hnsw' }] }));
    assert.equal(b.hasHnsw({ 'Node Type': 'Seq Scan' }), false);
    assert.equal(b.hasHnsw({ 'Node Type': 'Index Scan', 'Index Name': 'chunk_bot_idx' }), false);
  });
  await test('small smoke is deterministic offline and never accepted as NFR', async () => {
    const r = await b.main(['--offline-smoke=3'], {});
    assert.equal(r.runtime, 'NOT_EXECUTED'); assert.equal(r.nfr, 'NOT_ACCEPTED');
    assert.deepEqual(r, await b.main(['--offline-smoke=3'], {}));
  });
  await test('meaningful negative control: disabling ownership guard makes unchanged assertion fail', () => {
    const src = readFileSync(new URL('./nfr-200k.mjs', import.meta.url), 'utf8');
    const guard = "if (c.execute) insist(c.owned && c.database, 'EXPLICIT_OWNERSHIP_REQUIRED');";
    assert.ok(src.includes(guard));
    const mutated = src.replace(guard, 'if (c.execute) {}');
    assert.notEqual(mutated, src);
    // Data URL avoids filesystem mutation; execute only pure parseArgs assertion.
    const code = `import assert from 'node:assert/strict';\n${mutated.split('export async function execute')[0]
      .replace(/export /g, '').replace(/export const ROOT[^;]+;/, '')
      .replace(/const ROOT[^;]+;/, "const ROOT = '/unused';")}\nassert.throws(() => parseArgs(['--execute']));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 5000, encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /Missing expected exception/);
  });
  assert.equal(attemptedConnections, 0);
  console.log(JSON.stringify({ status: 'PASS', runtime: process.version, checks: results,
    attemptedConnections, nfrRuntime: 'NOT_EXECUTED', scriptSha256: createHash('sha256')
      .update(readFileSync(new URL('./nfr-200k.mjs', import.meta.url))).digest('hex') }, null, 2));
} finally { Socket.prototype.connect = connect; }
