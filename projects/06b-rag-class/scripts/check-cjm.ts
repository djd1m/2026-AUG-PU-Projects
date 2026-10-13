import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { checkConfig, createPool, normalizeSiteUrl } from '@n6b/db';
import { containsTerm } from './calibration/evaluate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^[A-Za-z0-9_-]{12}$/;
export const CJM_BUDGET_MS = 1_200_000;
export interface CjmSettings {
  base: string; foreign: string; source: string; question: string; term: string;
  expectedCitation: string; ownerUrl: string; reportPath: string;
}
export function cjmSettings(args: readonly string[], env: Readonly<Record<string, string | undefined>>): CjmSettings {
  if (args.length !== 1 || !args[0] || env.CJM_RUN_AUTHORIZED !== 'yes' || !env.CJM_REPORT_PATH
    || !env.SOURCE_URL || !env.FOREIGN_ORIGIN || !env.CJM_QUESTION?.trim()
    || env.CJM_QUESTION.length > 500 || !env.CJM_EXPECTED_TERM?.trim() || !env.CJM_EXPECTED_CITATION_URL) {
    throw new Error('missing_prerequisites');
  }
  const config = checkConfig([
    { name: 'BASE', kind: 'base-url', consequence: 'issued stand identity absent' },
    { name: 'FOREIGN_ORIGIN', kind: 'base-url', consequence: 'foreign-origin proof absent' },
    { name: 'DATABASE_URL_OWNER', kind: 'pg-url', user: 'n6b_owner', consequence: 'test account marking unavailable' },
  ], [], { BASE: args[0], FOREIGN_ORIGIN: env.FOREIGN_ORIGIN, DATABASE_URL_OWNER: env.DATABASE_URL_OWNER }, false);
  const source = normalizeSiteUrl(env.SOURCE_URL);
  const expected = normalizeSiteUrl(env.CJM_EXPECTED_CITATION_URL);
  if (!source || !expected || config.BASE === config.FOREIGN_ORIGIN) throw new Error('invalid_prerequisites');
  return { base: config.BASE as string, foreign: config.FOREIGN_ORIGIN as string, source,
    question: env.CJM_QUESTION, term: env.CJM_EXPECTED_TERM, expectedCitation: expected,
    ownerUrl: config.DATABASE_URL_OWNER as string, reportPath: path.resolve(env.CJM_REPORT_PATH) };
}

export interface CjmDeps {
  fetch: typeof fetch;
  markTest: (email: string) => Promise<string>;
  verifyBot: (bot: string, account: string) => Promise<void>;
  readLedger: (bot: string, account: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}
export interface CjmReport {
  status: string; stages: Record<string, unknown>[]; account_id?: string; bot_id?: string;
  public_id?: string; job_id?: string; database_evidence?: unknown; failure?: string;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid_protocol');
  return v as Record<string, unknown>;
};
const id = (v: unknown, re = UUID): string => {
  if (typeof v !== 'string' || !re.test(v)) throw new Error('invalid_protocol_id');
  return v;
};

export function verifyCitedAnswer(data: Record<string, unknown>, s: CjmSettings): void {
  if (data.outcome !== 'answered' || typeof data.answer_text !== 'string'
    || !containsTerm(data.answer_text, s.term) || !Array.isArray(data.citations) || !data.citations.length) {
    throw new Error('uncited_or_incorrect_answer');
  }
  let expected = false;
  for (const raw of data.citations) {
    const c = object(raw);
    id(c.chunk_id);
    if (typeof c.url !== 'string' || !normalizeSiteUrl(c.url)) throw new Error('invalid_citation');
    if (normalizeSiteUrl(c.url) === s.expectedCitation) expected = true;
  }
  if (!expected) throw new Error('unexpected_citation');
}

export async function runCjm(s: CjmSettings, deps: CjmDeps, report: CjmReport): Promise<number> {
  const deadline = deps.now() + CJM_BUDGET_MS;
  let cookie = '';
  let requests = 0;
  const request = async (stage: string, route: string, status: number, method = 'GET', body?: unknown,
    origin = s.base, authenticated = true): Promise<Response> => {
    if (deps.now() >= deadline || ++requests > 200) throw new Error('cjm_budget');
    const headers: Record<string, string> = { Origin: origin };
    if (method === 'OPTIONS') {
      headers['Access-Control-Request-Method'] = 'POST';
      headers['Access-Control-Request-Headers'] = 'content-type';
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated && cookie) headers.Cookie = cookie;
    const before = deps.now();
    const response = await deps.fetch(new URL(route, s.base), { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - deps.now()))) });
    report.stages.push({ stage, status: response.status, elapsed_ms: deps.now() - before });
    if (response.status !== status) throw new Error('unexpected_http_status');
    if (deps.now() >= deadline) throw new Error('cjm_deadline');
    return response;
  };
  const data = async (response: Response) => object(object(await response.json()).data);
  const cors = (response: Response) => {
    if (response.headers.get('access-control-allow-origin') !== s.foreign
      || response.headers.has('access-control-allow-credentials')) throw new Error('invalid_cors_protocol');
  };
  try {
    const email = `f16-cjm-${randomUUID()}@example.test`;
    const registration = await request('register', '/api/auth/register', 201, 'POST',
      { email, password: randomBytes(32).toString('base64url') }, s.base, false);
    await data(registration);
    const session = registration.headers.getSetCookie().find((c) => c.startsWith('n6b_session='));
    if (!session || !session.split(';')[0]!.slice('n6b_session='.length)) throw new Error('session_missing');
    cookie = session.split(';')[0]!;
    report.account_id = id(await deps.markTest(email));
    report.stages.push({ stage: 'mark_is_test_owner_db', verified: true, account_id: report.account_id });
    const created = await data(await request('create_bot_url', '/api/bots', 202, 'POST', { name: 'F16 CJM test', site_url: s.source }));
    report.bot_id = id(created.bot_id); report.public_id = id(created.public_id, PUBLIC_ID); report.job_id = id(created.job_id);
    await deps.verifyBot(report.bot_id, report.account_id);
    let succeeded = false;
    for (let poll = 0; poll < 180; poll++) {
      const job = await data(await request('poll_job', `/api/jobs/${report.job_id}`, 200));
      if (job.state === 'succeeded') { succeeded = true; break; }
      if (job.state !== 'running') throw new Error('job_failed_or_unknown_state');
      await deps.sleep(5000);
    }
    if (!succeeded) throw new Error('job_poll_budget');
    const sandbox = await data(await request('sandbox_cited_answer', `/api/bots/${report.bot_id}/ask`, 200, 'POST', { question: s.question }));
    verifyCitedAnswer(sandbox, s);
    const publication = await data(await request('publish_embed', `/api/bots/${report.bot_id}/publish`, 200, 'PATCH',
      { contact: 'fixture@example.test', allowed_origins: [s.foreign], demo_enabled: true }));
    if (publication.published !== true || publication.public_id !== report.public_id || typeof publication.embed_code !== 'string'
      || !publication.embed_code.includes(`src="${s.base}/w.js"`)
      || !publication.embed_code.includes(`data-bot="${report.public_id}"`)) throw new Error('invalid_embed_protocol');
    const query = `?bot=${report.public_id}`;
    const configResponse = await request('visitor_config', `/api/widget/config${query}&page=${encodeURIComponent(s.foreign + '/fixture')}`,
      200, 'GET', undefined, s.foreign, false);
    cors(configResponse);
    const config = await data(configResponse);
    if (config.badge_required !== true || config.badge_url !== `${s.base}/r/b/${report.public_id}`
      || typeof config.privacy_notice !== 'string' || !config.privacy_notice.trim()) throw new Error('invalid_badge_protocol');
    const options = await request('visitor_preflight', '/api/widget/ask' + query, 204, 'OPTIONS', undefined, s.foreign, false);
    cors(options);
    if (options.headers.get('access-control-allow-methods') !== 'POST'
      || options.headers.get('access-control-allow-headers')?.toLowerCase() !== 'content-type') throw new Error('invalid_preflight_protocol');
    const visitor = await request('visitor_cited_answer', '/api/widget/ask' + query, 200, 'POST', { question: s.question }, s.foreign, false);
    cors(visitor); verifyCitedAnswer(await data(visitor), s);
    const badge = await request('badge_redirect', `/r/b/${report.public_id}`, 302, 'GET', undefined, s.foreign, false);
    const location = badge.headers.get('location');
    if (!location) throw new Error('missing_badge_location');
    const landingUrl = new URL(location, s.base);
    if (landingUrl.origin !== s.base || landingUrl.pathname !== '/' || landingUrl.searchParams.get('ref') !== report.public_id) {
      throw new Error('invalid_badge_ref');
    }
    await request('landing_ref', landingUrl.pathname + landingUrl.search, 200, 'GET', undefined, s.foreign, false);
    report.database_evidence = await deps.readLedger(report.bot_id, report.account_id);
    report.status = 'passed_api_protocol';
    return 0;
  } catch {
    report.status = 'failed'; report.failure = 'CJM protocol/configuration/deadline failure; safe statuses in stages';
    if (report.bot_id && report.account_id) {
      report.database_evidence = await deps.readLedger(report.bot_id, report.account_id).catch(() => null);
    }
    return 1;
  }
}

export async function cjmMain(args: readonly string[]): Promise<number> {
  let s: CjmSettings;
  try { s = cjmSettings(args, process.env); } catch {
    console.error('NOT_EXECUTED: explicit issued base, grant, foreign origin, fixed source/question/evidence, owner DB and fresh report required.');
    return 2;
  }
  const report: CjmReport = { status: 'failed', stages: [] };
  const scriptHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
  let ownsReport = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  const write = () => writeFileSync(s.reportPath, JSON.stringify({ ...report, base_url: s.base, foreign_origin: s.foreign,
    tool_baseline_revision: '58b49da642298d991679241ce26c508b22392aee', tool_sha256: scriptHash,
    actual_stand_build_revision: null, build_binding: 'Coordinator must attach independently verified stand image/revision',
    source_url: s.source, started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
    elapsed_ms: Date.now() - started, browser_proof: 'NOT_EXECUTED: Node Origin headers do not prove browser CORS/CSP/CSS',
    paid_budget: 'one sandbox + one visitor answer, no retries; indexing is quota-bound existing worker job',
    public_readiness: 'Not implied by API protocol pass' }, null, 2) + '\n', { mode: 0o600 });
  const pool = createPool(s.ownerUrl, 'DATABASE_URL_OWNER');
  pool.options.statement_timeout = 5000; pool.options.query_timeout = 6000;
  try {
    writeFileSync(s.reportPath, '{}\n', { flag: 'wx', mode: 0o600 }); ownsReport = true;
    timer = setTimeout(() => { report.status = 'failed'; report.failure = 'hard_cjm_deadline'; write(); process.exit(1); }, CJM_BUDGET_MS);
    const identity = (await pool.query<{ current_user: string }>('SELECT current_user')).rows[0];
    if (identity?.current_user !== 'n6b_owner') throw new Error('owner_identity_unverified');
    return await runCjm(s, {
      fetch, now: Date.now, sleep: (ms) => delay(ms),
      markTest: async (email) => {
        const row = (await pool.query<{ id: string; is_test: boolean }>(
          'UPDATE account SET is_test = true WHERE email = $1 AND email LIKE $2 RETURNING id, is_test',
          [email, 'f16-cjm-%@example.test'])).rows[0];
        if (row?.is_test !== true) throw new Error('test_account_not_marked');
        return row.id;
      },
      verifyBot: async (bot, account) => {
        if ((await pool.query(`SELECT 1 FROM bot b JOIN account a ON a.id = b.account_id
          WHERE b.id = $1 AND a.id = $2 AND a.is_test`, [bot, account])).rowCount !== 1) throw new Error('stand_db_mismatch');
      },
      readLedger: async (bot, account) => (await pool.query(`SELECT id, kind, state, tokens_in, tokens_out
        FROM model_call_log WHERE bot_id = $1 AND account_id = $2 ORDER BY created_at, id`, [bot, account])).rows,
    }, report);
  } catch {
    report.failure = 'owner DB or report unavailable; no successful CJM claim'; return 1;
  } finally {
    if (ownsReport) write();
    await pool.end().catch(() => undefined);
    if (timer) clearTimeout(timer);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cjmMain(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
