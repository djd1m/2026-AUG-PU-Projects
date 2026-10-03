import { openSync, closeSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUDGET_TAG = 'SEC-03 budget last slot admits exactly one';
const OWNER_TAG = 'SEC-03 cross-owner GET must return 404';
const CONSENT_TAG = 'ATTR-01 absent consent must reject genuine cookie';
const PARTNER_TAG = 'PARTNER-01 ownerless code must reject';
const PAYMENT_TAG = 'PAY-02 wrong merchant must be rejected';
const FIXTURE_TAG = 'GEOM-03 fixture quality must be rejected with otherwise valid provenance';
const SEND_CAS_TAG = 'F07-CAS exactly one create POST';
const SEND_CAS_GUARDS = [
  ["if(s.state!=='preflight')return {authorized:false,code:'submission_no_replay',submission:s};",'/* send no-replay precondition removed */'],
  ["WHERE id=$1 AND state='preflight' RETURNING *","WHERE id=$1 RETURNING *"],
];
export function mutateSource(source, kind) {
  if(kind==='replicate-send-cas') {
    for(const [guard] of SEND_CAS_GUARDS)
      if(source.split(guard).length-1!==1)throw new Error('mutation_guard_mismatch');
    const mutated=SEND_CAS_GUARDS.reduce((text,[guard,replacement])=>text.replace(guard,replacement),source);
    if(mutated===source)throw new Error('mutation_noop');
    return mutated;
  }
  const sharing={'share-owner':'if(row.account_id!==accountId)','share-hold':'if(!a||paid(a)!==paid(r))'};
  const guard = sharing[kind] ?? (kind === 'consent' ? 'if(consent?.opted_in!==true)return false;' : kind === 'partner' ? '!p.account_id || ' : kind === 'payment' ? 'p.recipient?.account_id===intent.merchant_id' : kind === 'fixture' ? "if(mode==='fixture')" : kind === 'budget' ? 'if (counts[0]>=config.platformDailyLimit || counts[1]>=config.accountDailyLimit)' : kind === 'origin' ? 'if (req.headers.origin !== origin)' : 'AND account_id=$2');
  const replacement = sharing[kind] ? 'if(false)' : kind === 'consent' ? '/* consent guard removed */' : kind === 'partner' ? '' : kind === 'payment' ? 'true' : ['origin','budget','fixture'].includes(kind) ? 'if (false)' : 'AND $2::uuid IS NOT NULL';
  const expectedCount = kind !== 'owner' ? 1 : 2; // Media read and delete guards.
  if (!['origin','owner','budget','fixture','payment','consent','partner','share-owner','share-hold'].includes(kind) || source.split(guard).length - 1 !== expectedCount) {
    throw new Error('mutation_guard_mismatch');
  }
  const mutated = source.replaceAll(guard,replacement);
  if (mutated === source || mutated.includes(guard)) throw new Error('mutation_noop');
  return mutated;
}
export function runTest(dir, file, logName, { timeout = 120000, executable = process.execPath, concurrency } = {}) {
  const log = join(dir,logName); const fd = openSync(log,'w');
  let result;
  const {NODE_TEST_CONTEXT:ignoredTestContext,...childEnv}=process.env;
  try {
    const args=concurrency===1?['--test','--test-concurrency=1','--test-reporter=tap',file]:['--test-reporter=tap',file];
    result = spawnSync(executable,args,{
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
  if(kind==='replicate-send-cas') {
    // Nested parent failure is ERR_TEST_FAILURE, never an additional decisive
    // assertion. Any other leaf error (DB/syntax/timeout) makes this inconclusive.
    const leaves=blocks.filter(block=>/^\s*failureType:/m.test(block) && !/^\s*failureType: 'subtestsFailed'\s*$/m.test(block));
    return result.status===1 && /^# cancelled 0\s*$/m.test(result.output) && /^# skipped 0\s*$/m.test(result.output) &&
      leaves.length===1 && leaves.every(block=>
      /^\s*code: 'ERR_ASSERTION'\s*$/m.test(block) &&
      block.split('\n').some(line=>line.trim()===SEND_CAS_TAG) &&
      /^\s*expected: 1\s*$/m.test(block) && /^\s*actual: 2\s*$/m.test(block) &&
      /^\s*operator: 'strictEqual'\s*$/m.test(block));
  }
  return blocks.some(block => {
    if (!/^\s*code: 'ERR_ASSERTION'\s*$/m.test(block)) return false;
    if(kind==='share-owner')return block.split('\n').some(line=>line.trim()==='SHARE-03 cross-owner composite must return 404')
      && /^\s*expected: 404\s*$/m.test(block) && /^\s*actual: 200\s*$/m.test(block) && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    if(kind==='share-hold')return block.split('\n').some(line=>line.trim()==='PAY-05 final hold must reject cached paid composite')
      && /^\s*expected: true\s*$/m.test(block) && /^\s*actual: false\s*$/m.test(block) && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    if(kind==='consent')return block.split('\n').some(line=>line.trim()===CONSENT_TAG)
      && /^\s*expected: false\s*$/m.test(block) && /^\s*actual: true\s*$/m.test(block)
      && /^\s*operator: 'strictEqual'\s*$/m.test(block);
    if(kind==='partner')return block.split('\n').some(line=>line.includes(PARTNER_TAG))
      && /^\s*error: 'Missing expected rejection[^']*'\s*$/m.test(block);
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
async function verifySendCas(dir,evidenceDir) {
  if(typeof evidenceDir!=='string'||!isAbsolute(evidenceDir))throw new Error('mutation_evidence_directory_required');
  await mkdir(evidenceDir); // Fresh leaf only; refuse existing paths/symlinks.
  const sourcePath='web/provider-submissions.js',testPath='tests/replicate-send-cas.integration.test.js';
  const file=join(dir,sourcePath),testFile=join(dir,testPath),runnerFile=join(dir,'scripts/mutation.js');
  const source=await readFile(file),testSource=await readFile(testFile),runnerSource=await readFile(runnerFile);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const receipt={kind:'replicate-send-cas',source_path:sourcePath,test_path:testPath,
    source_sha256:hash(source),test_sha256:hash(testSource),runner_sha256:hash(runnerSource),
    started_at:new Date().toISOString(),runs:{},verdict:'inconclusive'};
  const green=r=>normalExit(r)&&r.status===0&&/^# fail 0\s*$/m.test(r.output)&&/^# pass [1-9]\d*\s*$/m.test(r.output)
    &&/^# skipped 0\s*$/m.test(r.output);
  async function run(name) {
    const result=runTest(dir,testPath,name+'.log',{concurrency:1});
    await cp(join(dir,name+'.log'),join(evidenceDir,name+'.log'));
    receipt.runs[name]={status:result.status,signal:result.signal,error_code:result.error?.code??null,
      log_sha256:hash(await readFile(join(evidenceDir,name+'.log')))};
    return result;
  }
  try {
    const mutated=mutateSource(source.toString('utf8'),'replicate-send-cas');
    receipt.mutant_sha256=hash(mutated);
    const baseline=await run('baseline');
    if(!green(baseline))throw new Error('mutation_baseline_failed');
    if(hash(await readFile(file))!==receipt.source_sha256 || hash(await readFile(testFile))!==receipt.test_sha256)
      throw new Error('mutation_source_drift');
    await writeFile(file,mutated);
    const mutant=await run('mutant');
    if(hash(await readFile(file))!==receipt.mutant_sha256 || hash(await readFile(testFile))!==receipt.test_sha256)
      throw new Error('mutation_source_drift');
    receipt.targeted_red=mutationDetected('replicate-send-cas',mutant);
    if(!receipt.targeted_red)throw new Error('mutation_inconclusive');
  }finally{
    await writeFile(file,source);
    try {
      const restored=await run('restored');
      receipt.restored_source_sha256=hash(await readFile(file));
      receipt.restored_test_sha256=hash(await readFile(testFile));
      receipt.restored_runner_sha256=hash(await readFile(runnerFile));
      receipt.restored_green=green(restored);
      receipt.identical=receipt.restored_source_sha256===receipt.source_sha256 &&
        receipt.restored_test_sha256===receipt.test_sha256 && receipt.restored_runner_sha256===receipt.runner_sha256;
      if(receipt.targeted_red && receipt.restored_green && receipt.identical)receipt.verdict='detected';
    }finally{
      receipt.finished_at=new Date().toISOString();
      await writeFile(join(evidenceDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    }
  }
  if(receipt.verdict!=='detected')throw new Error('mutation_restore_failed');
  return 1;
}
export async function verifyMutation(dir, kind, {evidenceDir}={}) {
  if(kind==='replicate-send-cas')return verifySendCas(dir,evidenceDir);
  const file = join(dir,kind.startsWith('share-') ? 'web/sharing.js' : kind === 'consent' ? 'web/attribution.js' : kind === 'partner' ? 'web/partners.js' : kind === 'payment' ? 'web/provider.js' : kind === 'fixture' ? 'web/quality.js' : kind === 'origin' ? 'web/boundaries.js' : kind === 'budget' ? 'web/jobs.js' : 'web/media.js');
  const test = kind.startsWith('share-') ? 'tests/sharing.test.js' : ['consent','partner'].includes(kind) ? 'tests/attribution.test.js' : kind === 'payment' ? 'tests/payments.test.js' : kind === 'fixture' ? 'tests/quality.test.js' : kind === 'origin' ? 'tests/boundaries.test.js' : kind === 'budget' ? 'tests/jobs.integration.test.js' : 'tests/integration.test.js';
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
  if (!['origin','owner','budget','fixture','payment','consent','partner','share-owner','share-hold','replicate-send-cas'].includes(kind)) throw new Error('Unknown mutation');
  const evidenceDir=process.argv[3];
  if(kind==='replicate-send-cas' && (!evidenceDir||!isAbsolute(evidenceDir)))throw new Error('mutation_evidence_directory_required');
  const dir = await mkdtemp(join(tmpdir(),'n8-f01-mutation-'));
  try {
    for (const path of ['web','db','scripts','tests','package.json','package-lock.json']) {
      await cp(path,join(dir,path),{recursive:true});
    }
    if (kind !== 'origin') await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
    const status=await verifyMutation(dir,kind,{evidenceDir});
    console.log(`mutation_${kind}_detected: baseline exit 0; targeted test exit ${status}${kind==='replicate-send-cas'?'; restored exit 0; SHA identical':''}`);
  } finally { await rm(dir,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
