import { openSync, closeSync, readFileSync } from 'node:fs';
import { mkdtemp, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUDGET_TAG = 'SEC-03 budget last slot admits exactly one';
const OWNER_TAG = 'SEC-03 cross-owner GET must return 404';
const PAYMENT_TAG = 'PAY-02 wrong merchant must be rejected';
const FIXTURE_TAG = 'GEOM-03 fixture quality must be rejected with otherwise valid provenance';
export function mutateSource(source, kind) {
  const guard = kind === 'payment' ? 'p.recipient?.account_id===intent.merchant_id' : kind === 'fixture' ? "if(mode==='fixture')" : kind === 'budget' ? 'if (counts[0]>=config.platformDailyLimit || counts[1]>=config.accountDailyLimit)' : kind === 'origin' ? 'if (req.headers.origin !== origin)' : 'AND account_id=$2';
  const replacement = kind === 'payment' ? 'true' : ['origin','budget','fixture'].includes(kind) ? 'if (false)' : 'AND $2::uuid IS NOT NULL';
  const expectedCount = kind !== 'owner' ? 1 : 2; // Media read and delete guards.
  if (!['origin','owner','budget','fixture','payment'].includes(kind) || source.split(guard).length - 1 !== expectedCount) {
    throw new Error('mutation_guard_mismatch');
  }
  const mutated = source.replaceAll(guard,replacement);
  if (mutated === source || mutated.includes(guard)) throw new Error('mutation_noop');
  return mutated;
}
export function runTest(dir, file, logName, { timeout = 120000, executable = process.execPath } = {}) {
  const log = join(dir,logName); const fd = openSync(log,'w');
  let result;
  const {NODE_TEST_CONTEXT:ignoredTestContext,...childEnv}=process.env;
  try {
    result = spawnSync(executable,['--test-reporter=tap',file],{
      cwd:dir,stdio:['ignore',fd,fd],timeout,env:childEnv
    });
  } finally { closeSync(fd); }
  return { ...result, output:readFileSync(log,'utf8') };
}
function normalExit(result) {
  return !result.error && result.signal === null && Number.isInteger(result.status);
}
export function mutationDetected(kind, result) {
  if (!normalExit(result) || result.status === 0) return false;
  const blocks = [...result.output.matchAll(/^[ \t]*---\r?\n([\s\S]*?)^[ \t]*\.\.\.\s*$/gm)].map(match=>match[1]);
  return blocks.some(block => {
    if (!/^\s*code: 'ERR_ASSERTION'\s*$/m.test(block)) return false;
    if(kind==='payment')return block.split('\n').some(line=>line.trim()===PAYMENT_TAG)
      && /^\s*expected: true\s*$/m.test(block) && /^\s*actual: false\s*$/m.test(block)
      && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    if (kind === 'origin') return /^\s*error: 'Missing expected exception\.'\s*$/m.test(block);
    if (kind === 'fixture') return block.split('\n').some(line=>line.trim()===FIXTURE_TAG)
      && /^\s*expected: true\s*$/m.test(block) && /^\s*actual: false\s*$/m.test(block)
      && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    if (kind === 'budget') return block.split('\n').some(line=>line.trim()===BUDGET_TAG)
      && /^\s*expected: 1\s*$/m.test(block) && /^\s*actual: 2\s*$/m.test(block)
      && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    return kind === 'owner' && block.split('\n').some(line=>line.trim()===OWNER_TAG)
      && /^\s*expected: 404\s*$/m.test(block) && /^\s*actual: 200\s*$/m.test(block)
      && /^\s*operator: 'strictEqual'\s*$/m.test(block);
  });
}
export async function verifyMutation(dir, kind) {
  const file = join(dir,kind === 'payment' ? 'web/provider.js' : kind === 'fixture' ? 'web/quality.js' : kind === 'origin' ? 'web/boundaries.js' : kind === 'budget' ? 'web/jobs.js' : 'web/media.js');
  const test = kind === 'payment' ? 'tests/payments.test.js' : kind === 'fixture' ? 'tests/quality.test.js' : kind === 'origin' ? 'tests/boundaries.test.js' : kind === 'budget' ? 'tests/jobs.integration.test.js' : 'tests/integration.test.js';
  const source = await readFile(file,'utf8');
  const mutated = mutateSource(source,kind);
  const baseline = runTest(dir,test,'baseline.log');
  if (!normalExit(baseline) || baseline.status !== 0 || !/^# fail 0\s*$/m.test(baseline.output)
      || !/^# pass [1-9]\d*\s*$/m.test(baseline.output)) throw new Error('mutation_baseline_failed');
  if (await readFile(file,'utf8') !== source) throw new Error('mutation_source_drift');
  await writeFile(file,mutated);
  const result = runTest(dir,test,'mutation.log');
  if (!mutationDetected(kind,result)) throw new Error('mutation_inconclusive');
  return result.status;
}
async function main() {
  const kind = process.argv[2] ?? 'origin';
  if (!['origin','owner','budget','fixture','payment'].includes(kind)) throw new Error('Unknown mutation');
  const dir = await mkdtemp(join(tmpdir(),'n8-f01-mutation-'));
  try {
    for (const path of ['web','db','scripts','tests','package.json','package-lock.json']) {
      await cp(path,join(dir,path),{recursive:true});
    }
    if (kind !== 'origin') await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
    console.log(`mutation_${kind}_detected: baseline exit 0; targeted test exit ${await verifyMutation(dir,kind)}`);
  } finally { await rm(dir,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
