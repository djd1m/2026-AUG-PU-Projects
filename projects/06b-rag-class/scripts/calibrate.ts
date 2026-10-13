import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig, ConfigError, createPool, LIMIT_VARIABLES, type AnswerBot, type Pool } from '@n6b/db';
import { answerQuestion, createLiveGateway, MODELS, PROVIDER_ROUTING, searchChunks,
  type AnswerAttempt, type AnswerChannel, type PaidGateway, type ChunkHit } from '@n6b/rag';
import { observe, runCases, scoreRun, validateDataset, type Observation } from './calibration/evaluate.js';
import { createFixture, prepareCorpus, readEvidence, seedCorpus } from './calibration/live-store.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const RUN_BUDGET_MS = 1_200_000;
const digest = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function requireLive(args: readonly string[], env: Readonly<Record<string, string | undefined>>) {
  if (args.length !== 4 || args[0] !== '--live' || args[1] !== '--seed-fixture' || args[2] !== '--report'
    || !args[3] || env.CALIBRATION_LIVE_AUTHORIZED !== 'yes' || env.CALIBRATION_MODE !== 'live') {
    throw new ConfigError('CALIBRATION_LIVE_AUTHORIZED', 'explicit live/seed grant and fresh report path required; fake mode refused');
  }
  const config = checkConfig([
    { name: 'DATABASE_URL_SERVICE', kind: 'pg-url', user: 'n6b_app_service', consequence: 'real PG search unavailable' },
    { name: 'MIN_SIMILARITY', kind: 'ratio', consequence: 'negative eligibility cannot be measured' },
    { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'live calibration unavailable' },
    ...Object.values(LIMIT_VARIABLES).map((name) => ({ name, kind: 'limit' as const, consequence: 'paid ceiling absent' })),
  ], [], env, false);
  return { reportPath: path.resolve(args[3]), dbUrl: config.DATABASE_URL_SERVICE as string,
    minSimilarity: config.MIN_SIMILARITY as number };
}

export function captureGateway(gateway: PaidGateway, capture: (vector: readonly number[]) => Promise<void>): PaidGateway {
  // Delegate to the real attempt; never construct a provider or replace the product's routing.
  return {
    beginAnswer: async (channel: AnswerChannel, owner) => {
      const attempt = await gateway.beginAnswer(channel, owner);
      const wrapped: AnswerAttempt = {
        embedQuestion: async (question) => {
          const vector = await attempt.embedQuestion(question);
          await capture(vector);
          return vector;
        },
        generate: (messages) => attempt.generate(messages),
      };
      return wrapped;
    },
    embedIndexBatch: (...args) => gateway.embedIndexBatch(...args),
  } as PaidGateway;
}

export async function main(args: readonly string[]): Promise<number> {
  let settings: ReturnType<typeof requireLive>;
  try { settings = requireLive(args, process.env); } catch {
    console.error('NOT_EXECUTED: explicit live/seed gate or required configuration missing/invalid. No paid call.');
    return 2;
  }
  const started = Date.now();
  const observations: Observation[] = [];
  const report: Record<string, unknown> = { status: 'failed', started_at: new Date(started).toISOString(),
    source_revision: '58b49da642298d991679241ce26c508b22392aee', build_revision: null,
    mode: 'live', ingestion: 'explicit fixture DB seed; real gateway embeddings; NOT an actual website crawl',
    models: MODELS, provider_routing: PROVIDER_ROUTING, min_similarity: settings.minSimilarity,
    budget: { total_ms: RUN_BUDGET_MS, index_batches: 1, max_answer_attempts: 30,
      max_question_embeddings: 30, max_generations: 30, max_output_tokens: 400, retries: 0 },
    observations, cost: null, human_review: 'Required: deterministic term checks do not detect every contradiction' };
  let pool: Pool | undefined;
  let liveBot: AnswerBot | undefined;
  let ownReport = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const safeWrite = () => {
    report.finished_at = new Date().toISOString();
    report.elapsed_ms = Date.now() - started;
    let output = JSON.stringify(report, null, 2);
    for (const name of ['OPENROUTER_API_KEY', 'DATABASE_URL_SERVICE', 'DATABASE_URL_OWNER', 'VISITOR_SECRET', 'SESSION_SECRET']) {
      const secret = process.env[name];
      if (secret) output = output.split(JSON.stringify(secret).slice(1, -1)).join('[REDACTED]');
    }
    writeFileSync(settings.reportPath, output + '\n', { mode: 0o600 });
  };
  try {
    const fixturePaths = ['tests/calibration/questions.json', 'tests/calibration/corpus.json', 'tests/calibration/site.html'];
    const buffers = fixturePaths.map((p) => {
      const bytes = readFileSync(path.join(ROOT, p));
      if (bytes.length > 64_000) throw new Error('fixture_byte_budget');
      return bytes;
    });
    const { questions, corpus } = validateDataset(JSON.parse(buffers[0]!.toString('utf8')), JSON.parse(buffers[1]!.toString('utf8')));
    const prepared = prepareCorpus(corpus);
    const sources = [...fixturePaths, 'scripts/calibrate.ts', 'scripts/calibration/evaluate.ts', 'scripts/calibration/live-store.ts',
      'packages/rag/src/prompt.ts', 'packages/rag/src/answer.ts', 'packages/rag/src/search.ts',
      'packages/rag/src/paid-call.ts', 'packages/rag/src/live.ts', 'packages/rag/src/provider/openrouter.ts'];
    report.source_hashes = Object.fromEntries(sources.map((p) => [p, digest(readFileSync(path.join(ROOT, p)))]));
    const runtimePaths = ['packages/db/dist', 'packages/rag/dist'].flatMap((dir) =>
      readdirSync(path.join(ROOT, dir), { recursive: true }).filter((p) => typeof p === 'string' && p.endsWith('.js'))
        .map((p) => `${dir}/${p}`));
    report.runtime_dist_hashes = Object.fromEntries(runtimePaths.map((p) => [p, digest(readFileSync(path.join(ROOT, p)))]));
    report.runtime_binding = 'Node workspace exports load these dist modules; source/build correspondence requires coordinator verification';
    report.fixture_sha256 = Object.fromEntries(fixturePaths.map((p, i) => [p, digest(buffers[i]!)]));
    report.corpus_budget = { chunks: prepared.texts.length, bytes: prepared.bytes, token_estimate: prepared.tokenEstimate };
    writeFileSync(settings.reportPath, '{}\n', { flag: 'wx', mode: 0o600 });
    ownReport = true;
    const deadline = started + RUN_BUDGET_MS;
    const checkpoint = () => { if (Date.now() + 35_000 >= deadline) throw new Error('run_deadline'); };
    timer = setTimeout(() => {
      report.status = 'failed'; report.failure = 'hard_run_deadline'; report.inflight_outcome = 'unknown; inspect model_call_log';
      safeWrite(); process.exit(1);
    }, Math.max(1, deadline - Date.now()));
    pool = createPool(settings.dbUrl, 'DATABASE_URL_SERVICE');
    pool.options.statement_timeout = 5000;
    pool.options.query_timeout = 6000;
    const gateway = createLiveGateway({ pool, log: () => undefined });
    const bot = await createFixture(pool);
    liveBot = bot;
    report.bot = bot; report.is_test = true;
    report.quota_before = (await readEvidence(pool, bot)).quotas;
    checkpoint();
    await seedCorpus(pool, gateway, bot, prepared, checkpoint);
    let previousIds = new Set((await readEvidence(pool, bot)).calls.map((r) => r.id));
    const failure = await runCases(questions, async (q) => {
      checkpoint();
      const before = Date.now();
      let hits: ChunkHit[] = [];
      const measured = captureGateway(gateway, async (vector) => {
        checkpoint();
        hits = await searchChunks(pool!, bot.id, vector);
      });
      const response = await answerQuestion({ servicePool: pool!, gateway: measured, minSimilarity: settings.minSimilarity },
        { bot, question: q.question, channel: { kind: 'sandbox', accountId: bot.accountId }, logChannel: 'sandbox' });
      const evidence = await readEvidence(pool!, bot);
      const calls = evidence.calls.filter((r) => !previousIds.has(r.id));
      previousIds = new Set(evidence.calls.map((r) => r.id));
      return observe(q.id, response, hits, Date.now() - before, calls);
    }, observations, deadline);
    report.failure = failure;
    const evidence = await readEvidence(pool, bot);
    report.database_evidence = evidence;
    const score = scoreRun(questions, corpus, observations, settings.minSimilarity);
    report.score = score;
    const count = (kind: string) => evidence.calls.filter((r) => r.kind === kind).length;
    const ledgerValid = count('embed_index') === 1 && count('embed_question') === 30 && count('answer') <= 30
      && evidence.calls.every((r) => r.state === 'succeeded') && evidence.question_logs.length === 30;
    report.ledger_valid = ledgerValid;
    report.status = !failure && score.passed && ledgerValid ? 'passed' : 'failed';
    return report.status === 'passed' ? 0 : 1;
  } catch {
    report.status = 'failed'; report.failure = 'execution_failed; inspect safe DB ledger/provider availability';
    if (pool && liveBot) report.database_evidence = await readEvidence(pool, liveBot).catch(() => null);
    return 1;
  } finally {
    if (ownReport) safeWrite();
    await pool?.end().catch(() => undefined);
    if (timer) clearTimeout(timer);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
