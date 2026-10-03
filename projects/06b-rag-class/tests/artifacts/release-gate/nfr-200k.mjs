/** Future local NFR200k only. Default/import/offline smoke NEVER connects.
 * Coordinator supplies private NFR200K_OWNER_URL / NFR200K_SERVICE_URL,
 * NFR200K_RUNTIME_IDENTITY and NFR200K_SOURCE_HASHES JSON; no ambient DB URLs.
 * --execute --owned-fixture --database=n6b_nfr200k_<unique lowercase suffix>
 * [--deadline-ms=1140000]. Node22, existing pg and canonical compiled workspace.
 * Identity keys: nodeImageDigest, pgImageDigest (sha256:<64 hex>), cpuLimit (2),
 * hostCpuCount, hostRamBytes, diskFreeBytes, diskTotalBytes, neighborLoad
 * (quiescent|present|unknown). Source hashes must match sourceHashes() exactly;
 * coordinator must attest compilation provenance, own compose lifecycle, fresh
 * preflight, shared heavy lock, CPU2, >=8GiB initial disk estimate, continuous
 * 1.5GiB floor and external watchdog. These inputs are declarations, not monitors.
 * No schema lifecycle or deletes: coordinator removes ONLY this owned DB/fixture,
 * including partial fixture on failure. Output is JSON to coordinator-owned stdout.
 * Synthetic corpus tests latency, not embedding quality, recall or full live NFR.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const HEAD = '1070ac4d483742797c00c768ab02e25f7436b9c8';
export const DIM = 1536, BOTS = 10, PER_BOT = 20000, TOTAL = 200000;
export const SEED = 0x6b200003, TEXT = 'local benchmark fixture';
const TABLES = ['account', 'session', 'bot', 'source', 'source_file', 'document', 'chunk',
  'index_job', 'question_log', 'model_call_log', 'quota_counter', 'widget_install',
  'badge_event', 'growth_event', 'handover_token', 'operator', 'quota_reset_log'];
class GuardError extends Error {}
const sha = (value) => createHash('sha256').update(value).digest('hex');
const insist = (ok, code) => { if (!ok) throw new GuardError(code); };

export function parseArgs(args) {
  const c = { execute: false, owned: false, database: null, deadlineMs: 1140000, smoke: null };
  const seen = new Set();
  for (const arg of args) {
    const key = arg.split('=')[0];
    insist(!seen.has(key), 'DUPLICATE_ARGUMENT'); seen.add(key);
    if (arg === '--execute') c.execute = true;
    else if (arg === '--owned-fixture') c.owned = true;
    else if (arg.startsWith('--database=')) c.database = arg.slice(11);
    else if (arg.startsWith('--deadline-ms=')) {
      insist(/^\d+$/.test(arg.slice(14)), 'BAD_DEADLINE'); c.deadlineMs = Number(arg.slice(14));
    } else if (arg.startsWith('--offline-smoke=')) {
      insist(/^\d+$/.test(arg.slice(16)), 'BAD_SMOKE_SIZE'); c.smoke = Number(arg.slice(16));
    } else throw new GuardError('UNKNOWN_ARGUMENT');
  }
  insist(Number.isSafeInteger(c.deadlineMs) && c.deadlineMs >= 1000 && c.deadlineMs <= 1200000, 'BAD_DEADLINE');
  insist(c.database === null || /^n6b_nfr200k_[a-z0-9]{8,32}$/.test(c.database), 'BAD_DATABASE_PREFIX');
  insist(c.smoke === null || (c.smoke >= 1 && c.smoke <= 100), 'BAD_SMOKE_SIZE');
  insist(!(c.smoke !== null && (c.execute || c.owned || c.database)), 'SMOKE_IS_OFFLINE_ONLY');
  if (c.execute) insist(c.owned && c.database, 'EXPLICIT_OWNERSHIP_REQUIRED');
  else insist(!c.owned && c.database === null, 'EXECUTE_REQUIRED');
  return c;
}

export function validateConfig(c, env) {
  insist(c.execute && c.owned && /^n6b_nfr200k_[a-z0-9]{8,32}$/.test(c.database), 'EXPLICIT_OWNERSHIP_REQUIRED');
  insist(Number.isSafeInteger(c.deadlineMs) && c.deadlineMs >= 1000 && c.deadlineMs <= 1200000, 'BAD_DEADLINE');
  const keys = ['NFR200K_OWNER_URL', 'NFR200K_SERVICE_URL', 'NFR200K_RUNTIME_IDENTITY', 'NFR200K_SOURCE_HASHES'];
  insist(Object.keys(env).filter(k => k.startsWith('NFR200K_')).every(k => keys.includes(k)), 'UNKNOWN_CONFIG');
  for (const k of keys) insist(typeof env[k] === 'string' && env[k].length > 0, 'MISSING_PRIVATE_CONFIG');
  const urls = keys.slice(0, 2).map(k => {
    let u; try { u = new URL(env[k]); } catch { throw new GuardError('BAD_PRIVATE_URL'); }
    insist(['postgres:', 'postgresql:'].includes(u.protocol) && !u.search && !u.hash,
      'BAD_PRIVATE_URL');
    insist(['db', 'nfr-db', 'localhost', '127.0.0.1', '[::1]'].includes(u.hostname), 'NONLOCAL_DATABASE');
    insist(u.pathname === `/${c.database}` && u.username && u.password.length >= 24, 'WRONG_DATABASE_OR_CREDENTIALS');
    return u;
  });
  insist(urls[0].host === urls[1].host && urls[0].username !== urls[1].username
    && urls[1].username === 'n6b_app_service', 'SEPARATE_SERVICE_LOGIN_REQUIRED');
  let identity, hashes;
  try { identity = JSON.parse(env.NFR200K_RUNTIME_IDENTITY); hashes = JSON.parse(env.NFR200K_SOURCE_HASHES); }
  catch { throw new GuardError('BAD_IDENTITY_JSON'); }
  const identityKeys = ['nodeImageDigest', 'pgImageDigest', 'cpuLimit', 'hostCpuCount', 'hostRamBytes',
    'diskFreeBytes', 'diskTotalBytes', 'neighborLoad'];
  insist(identity && Object.keys(identity).length === identityKeys.length
    && Object.keys(identity).every(k => identityKeys.includes(k)), 'BAD_RUNTIME_IDENTITY');
  for (const k of ['nodeImageDigest', 'pgImageDigest']) insist(/^sha256:[a-f0-9]{64}$/.test(identity[k]), 'BAD_IMAGE_DIGEST');
  insist(identity.cpuLimit === 2 && ['quiescent', 'present', 'unknown'].includes(identity.neighborLoad), 'BAD_RUNTIME_IDENTITY');
  for (const k of ['hostCpuCount', 'hostRamBytes', 'diskFreeBytes', 'diskTotalBytes'])
    insist(Number.isSafeInteger(identity[k]) && identity[k] > 0, 'BAD_RUNTIME_IDENTITY');
  insist(identity.diskFreeBytes >= 8 * 1024 ** 3 && identity.diskTotalBytes >= identity.diskFreeBytes, 'RESOURCE_GATE');
  insist(hashes && !Array.isArray(hashes) && typeof hashes === 'object'
    && Object.values(hashes).every(v => /^[a-f0-9]{64}$/.test(v)), 'BAD_SOURCE_HASHES');
  return { ownerUrl: env.NFR200K_OWNER_URL, serviceUrl: env.NFR200K_SERVICE_URL, identity, hashes };
}

// First coordinate encodes the row exactly in float32; remaining coordinates
// use a row-specific PRNG, dense signed float32 values (no sparse/identical vectors).
export function vectorFor(index, seed = SEED) {
  insist(Number.isSafeInteger(index) && index >= 0 && index < TOTAL + 1000, 'BAD_VECTOR_INDEX');
  insist(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'BAD_SEED');
  let state = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const v = new Array(DIM);
  v[0] = (index + 1) / 262144;
  for (let d = 1; d < DIM; d++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const value = Math.fround(((state >>> 0) + 0.5) / 2147483648 - 1);
    v[d] = value === 0 ? 2 ** -24 : value;
  }
  return v;
}
export function fixtureId(kind, index) {
  return `6b200000-0000-4000-8000-${(kind * 1000000 + index).toString(16).padStart(12, '0')}`;
}
export function botPublicId(bot) {
  insist(Number.isSafeInteger(bot) && bot >= 0 && bot < BOTS, 'BAD_BOT');
  return `nfr200k_${String(bot).padStart(4, '0')}`;
}
export function chunkText(index) {
  insist(Number.isSafeInteger(index) && index >= 0 && index < TOTAL, 'BAD_CHUNK_INDEX');
  return `${TEXT} ${String(index).padStart(6, '0')}`;
}
export function queryFor(index) {
  insist(Number.isSafeInteger(index) && index >= 0 && index < 1000, 'BAD_QUERY_INDEX');
  const bot = index % BOTS;
  return { bot, botId: fixtureId(2, bot), vector: vectorFor(bot * PER_BOT + ((index * 7919) % PER_BOT)) };
}
export function statistics(values) {
  insist(Array.isArray(values) && values.length > 0 && values.every(v => Number.isFinite(v) && v >= 0), 'BAD_LATENCIES');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { n: sorted.length, p50: rank(.50), p95: rank(.95), p99: rank(.99), max: sorted.at(-1) };
}
export function assertHits(hits, bot) {
  insist(Array.isArray(hits) && hits.length === 5 && new Set(hits.map(h => h.id)).size === 5, 'MISSING_OR_DUPLICATE_HITS');
  for (const h of hits) {
    insist(h.documentId === fixtureId(4, bot) && Number.isFinite(h.sim), 'WRONG_BOT_OR_INVALID_HIT');
    const n = Number.parseInt(h.id?.split('-').at(-1), 16) - 5000000;
    insist(h.id === fixtureId(5, n) && n >= bot * PER_BOT && n < (bot + 1) * PER_BOT, 'WRONG_BOT_OR_INVALID_HIT');
    insist(h.text === chunkText(n), 'INVALID_HIT_TEXT');
  }
}
export function hasHnsw(node) {
  return !!node && ((node['Index Name'] === 'chunk_embedding_hnsw' && node['Node Type'] === 'Index Scan')
    || (node.Plans || []).some(hasHnsw));
}
export function sourceHashes() {
  const files = ['package-lock.json', 'packages/rag/package.json', 'packages/db/package.json',
    'tests/artifacts/release-gate/nfr-200k.mjs'];
  const walk = dir => {
    for (const item of readdirSync(resolve(ROOT, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (item.isFile() && /\.(ts|js|sql)$/.test(item.name)) files.push(path);
    }
  };
  for (const dir of ['packages/rag/src', 'packages/rag/dist', 'packages/db/src', 'packages/db/dist', 'packages/db/migrations']) walk(dir);
  return Object.fromEntries(files.map(f => [f, sha(readFileSync(resolve(ROOT, f)))]));
}

export async function execute(c, env) {
  const start = performance.now();
  const cfg = validateConfig(c, env); // all guards before any dependency import/connection
  insist(process.versions.node.split('.')[0] === '22', 'NODE22_REQUIRED');
  const hashes = sourceHashes();
  insist(JSON.stringify(Object.entries(hashes).sort()) === JSON.stringify(Object.entries(cfg.hashes).sort()), 'SOURCE_HASH_MISMATCH');
  const deadline = start + c.deadlineMs;
  const report = { status: 'FAIL', nfr: 'FAIL', errors: 0, sourceRevision: HEAD, sourceHashes: hashes,
    identityInputs: cfg.identity, node: process.version, platform: process.platform, arch: process.arch,
    seed: SEED, dimensions: DIM, total: TOTAL, bots: BOTS, perBot: PER_BOT,
    textBytes: Buffer.byteLength(chunkText(0)), tokens: 6, batchSize: 32,
    warmupCount: 50, measurementCount: 500, timing: 'Sequential searchChunks including transaction and SET LOCAL',
    coldMeaning: 'First post-load calls; not proof of empty OS/Postgres caches',
    cold: [], rawLatenciesMs: [], plans: [], cleanup: 'Coordinator-owned isolated database only; fixture retained' };
  const check = () => insist(performance.now() < deadline, 'OVERALL_DEADLINE');
  const timer = setTimeout(() => {
    process.stdout.write(JSON.stringify({ ...report, status: 'FAIL', nfr: 'FAIL', errors: report.errors + 1,
      failure: 'OVERALL_DEADLINE', elapsedMs: performance.now() - start }) + '\n');
    process.exit(1);
  }, Math.max(1, deadline - performance.now()));
  let owner, service;
  try {
    const { default: pg } = await import('pg');
    const rag = await import('@n6b/rag');
    const search = await import(pathToFileURL(resolve(ROOT, 'packages/rag/dist/search.js')).href);
    const { withService } = await import('@n6b/db');
    insist(rag.searchChunks === search.searchChunks && search.SEARCH_TOP_K === 5 && search.HNSW_EF_SEARCH === 64,
      'CANONICAL_SEARCH_MISMATCH');
    const opts = { max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
      statement_timeout: 60000, query_timeout: 65000, options: '-c search_path=public,pg_catalog' };
    owner = new pg.Pool({ ...opts, connectionString: cfg.ownerUrl });
    service = new pg.Pool({ ...opts, connectionString: cfg.serviceUrl });
    owner.on('error', () => { report.errors++; }); service.on('error', () => { report.errors++; });
    const q = async (sql, params = []) => { check(); const r = await owner.query(sql, params); check(); return r.rows; };
    const [db] = await q(`SELECT current_database() AS db, current_user AS login,
      pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`);
    insist(db.db === c.database && db.login === db.owner, 'DATABASE_OWNER_MISMATCH');
    const [role] = await q('SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname=current_user');
    insist(role.rolbypassrls || role.rolsuper, 'OWNER_CANNOT_VERIFY_EMPTY_RLS_TABLES');
    const login = await service.query('SELECT current_database() AS db, current_user AS login');
    insist(login.rows[0].db === c.database && login.rows[0].login === 'n6b_app_service', 'SERVICE_LOGIN_MISMATCH');
    report.serviceRole = await withService(service, async client => (await client.query(
      `SELECT current_user AS role, current_setting('row_security') AS row_security,
        current_setting('enable_seqscan') AS seqscan, current_setting('enable_indexscan') AS indexscan,
        current_setting('enable_bitmapscan') AS bitmapscan, current_setting('enable_sort') AS sort,
        current_setting('statement_timeout') AS statement_timeout`)).rows[0]);
    insist(report.serviceRole.role === 'n6b_service', 'SERVICE_ROLE_MISMATCH');
    insist(['seqscan', 'indexscan', 'bitmapscan', 'sort'].every(k => report.serviceRole[k] === 'on'), 'NONNATURAL_PLANNER_CONFIG');
    insist(['1min', '60s', '60000ms'].includes(report.serviceRole.statement_timeout), 'STATEMENT_TIMEOUT_MISMATCH');
    report.postgres = (await q('SELECT version() AS version'))[0].version;
    report.pgvector = (await q("SELECT extversion FROM pg_extension WHERE extname='vector'"))[0]?.extversion;
    insist(report.pgvector === '0.8.6' && /PostgreSQL 16\./.test(report.postgres), 'DATABASE_VERSION_MISMATCH');
    const migrations = await q('SELECT filename FROM schema_migrations ORDER BY filename');
    insist(JSON.stringify(migrations.map(r => r.filename)) === JSON.stringify(
      Object.keys(hashes).filter(f => f.startsWith('packages/db/migrations/')).map(f => f.split('/').at(-1)).sort()), 'MIGRATIONS_MISMATCH');
    const tables = await q("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    insist(JSON.stringify(tables.map(r => r.tablename)) === JSON.stringify([...TABLES, 'schema_migrations'].sort()), 'UNEXPECTED_SCHEMA_TABLES');
    for (const table of TABLES) insist((await q(`SELECT EXISTS(SELECT 1 FROM ${table}) AS used`))[0].used === false, 'BUSINESS_FIXTURE_NOT_EMPTY');
    report.indexDefinition = (await q("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='chunk_embedding_hnsw'"))[0]?.indexdef;
    insist(/USING hnsw \(embedding vector_cosine_ops\)/.test(report.indexDefinition)
      && /m='?16'?/.test(report.indexDefinition) && /ef_construction='?64'?/.test(report.indexDefinition), 'HNSW_SCHEMA_MISMATCH');
    const [dim] = await q("SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='chunk'::regclass AND attname='embedding'");
    insist(dim.type === 'vector(1536)', 'VECTOR_DIMENSION_MISMATCH');
    await q('INSERT INTO account(id,is_test) VALUES($1,true)', [fixtureId(1, 0)]);
    for (let b = 0; b < BOTS; b++) {
      await q('INSERT INTO bot(id,account_id,public_id,name) VALUES($1,$2,$3,$4)',
        [fixtureId(2, b), fixtureId(1, 0), botPublicId(b), `local fixture ${b}`]);
      await q("INSERT INTO source(id,bot_id,account_id,kind,file_name) VALUES($1,$2,$3,'pdf','local-fixture.pdf')",
        [fixtureId(3, b), fixtureId(2, b), fixtureId(1, 0)]);
      await q('INSERT INTO document(id,source_id,account_id,locator_page,title,text,content_sha256) VALUES($1,$2,$3,1,$4,$5,$6)',
        [fixtureId(4, b), fixtureId(3, b), fixtureId(1, 0), 'local fixture', TEXT, sha(TEXT)]);
    }
    insist(rag.countTokens(chunkText(0)) === 6 && rag.countTokens(chunkText(TOTAL - 1)) === 6, 'TOKEN_CONTRACT_MISMATCH');
    const corpus = createHash('sha256');
    for (let offset = 0; offset < TOTAL; offset += 32) {
      check(); const params = [], tuples = [];
      for (let i = offset; i < Math.min(offset + 32, TOTAL); i++) {
        const bot = Math.floor(i / PER_BOT), literal = search.vectorLiteral(vectorFor(i));
        corpus.update(`${i}:${literal}\n`);
        const text = chunkText(i);
        const row = [fixtureId(5, i), fixtureId(4, bot), fixtureId(2, bot), fixtureId(1, 0),
          i % PER_BOT, text, sha(text), 6, literal];
        const base = params.length; params.push(...row);
        tuples.push(`(${row.map((_, j) => `$${base + j + 1}${j === 8 ? '::vector' : ''}`).join(',')})`);
      }
      await q(`INSERT INTO chunk(id,document_id,bot_id,account_id,ord,text,text_sha256,tokens,embedding) VALUES ${tuples.join(',')}`, params);
    }
    report.corpusSha256 = corpus.digest('hex');
    const counts = await q('SELECT bot_id,count(*)::int AS n FROM chunk GROUP BY bot_id ORDER BY bot_id');
    report.rowCounts = counts;
    insist(counts.length === BOTS && counts.every((r, b) => r.bot_id === fixtureId(2, b) && r.n === PER_BOT), 'ROW_COUNT_MISMATCH');
    insist((await q('SELECT count(*)::int AS n FROM chunk'))[0].n === TOTAL, 'ROW_COUNT_MISMATCH');
    await q('ANALYZE chunk');
    report.sizes = (await q(`SELECT pg_database_size(current_database())::text AS database_bytes,
      pg_table_size('chunk')::text AS table_bytes, pg_indexes_size('chunk')::text AS indexes_bytes,
      pg_relation_size('chunk_embedding_hnsw')::text AS hnsw_bytes`))[0];
    const disk = statfsSync(ROOT, { bigint: true });
    report.runnerDisk = { freeBytes: String(disk.bavail * disk.bsize), totalBytes: String(disk.blocks * disk.bsize),
      note: 'Runner filesystem; PostgreSQL host disk/floor is coordinator monitored' };
    const sample = async (i) => {
      check(); const query = queryFor(i), t = performance.now();
      const hits = await rag.searchChunks(service, query.botId, query.vector, 5);
      const ms = performance.now() - t; check(); assertHits(hits, query.bot); return ms;
    };
    // First post-load calls, not OS/Postgres-cache-cold proof; no cache flushing.
    for (let i = 0; i < BOTS; i++) report.cold.push({ bot: i, ms: await sample(i) });
    for (let i = 0; i < 50; i++) await sample(i + 10);
    for (let i = 0; i < 500; i++) report.rawLatenciesMs.push(await sample(i + 60));
    report.statsMs = statistics(report.rawLatenciesMs);
    for (let i = 0; i < BOTS; i++) {
      check(); const query = queryFor(i);
      const plan = await withService(service, async client => {
        await client.query('SET LOCAL hnsw.iterative_scan = strict_order');
        await client.query(`SET LOCAL hnsw.ef_search = ${search.HNSW_EF_SEARCH}`);
        return (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${search.SEARCH_SQL}`,
          [query.botId, search.vectorLiteral(query.vector), 5])).rows[0]['QUERY PLAN'][0];
      });
      check(); report.plans.push({ bot: i, naturalHnsw: hasHnsw(plan.Plan), plan });
    }
    insist((await q('SELECT count(*)::int AS n FROM chunk'))[0].n === TOTAL, 'ROW_COUNT_MISMATCH');
    for (const table of ['index_job', 'model_call_log'])
      insist((await q(`SELECT EXISTS(SELECT 1 FROM ${table}) AS used`))[0].used === false, 'UNEXPECTED_JOB_OR_PROVIDER_ROWS');
    insist(report.errors === 0, 'POOL_ERROR');
    insist(report.plans.every(p => p.naturalHnsw), 'NO_NATURAL_HNSW_PLAN');
    insist(report.statsMs.p95 <= 100, 'P95_ABOVE_100MS');
    report.status = 'PASS'; report.nfr = 'LOCAL_SEARCH_ONLY_PASS';
  } catch (e) {
    report.status = 'FAIL'; report.nfr = 'FAIL'; report.errors++;
    // Never emit driver errors, URLs, credentials, stack traces or SQL parameters.
    report.failure = e instanceof GuardError ? e.message : 'RUNTIME_ERROR_REDACTED';
    if (/^[0-9A-Z]{5}$/.test(e?.code)) report.sqlstate = e.code;
  } finally {
    try { if (service) await service.end(); if (owner) await owner.end(); check(); }
    catch { report.status = 'FAIL'; report.nfr = 'FAIL'; report.errors++; report.failure = 'CLOSE_OR_DEADLINE_ERROR'; }
    clearTimeout(timer); report.elapsedMs = performance.now() - start;
  }
  return report;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const c = parseArgs(args);
  if (c.smoke !== null) {
    const digest = createHash('sha256');
    for (let i = 0; i < c.smoke; i++) digest.update(JSON.stringify(vectorFor(i)));
    return { status: 'OFFLINE_SMOKE', runtime: 'NOT_EXECUTED', nfr: 'NOT_ACCEPTED', rows: c.smoke, sha256: digest.digest('hex') };
  }
  if (!c.execute) return { status: 'PREPARE_REFUSE_EXECUTION', runtime: 'NOT_EXECUTED', nfr: 'NOT_ACCEPTED',
    reason: 'Explicit execution, owned isolated empty migrated fixture, private configuration and coordinator resource gate required' };
  return execute(c, env);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await main(); console.log(JSON.stringify(result));
    if (result.status === 'FAIL') process.exitCode = 1;
  } catch { console.log(JSON.stringify({ status: 'REFUSED', runtime: 'NOT_EXECUTED', nfr: 'NOT_ACCEPTED',
    reason: 'Invalid explicit arguments, ownership or configuration; sensitive errors suppressed' })); process.exitCode = 1; }
}
