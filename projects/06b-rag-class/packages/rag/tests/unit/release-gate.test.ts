import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PaidGateway, ChunkHit } from '@n6b/rag';
import { captureGateway, main, requireLive } from '../../../../scripts/calibrate.js';
import { cjmMain, cjmSettings, runCjm, type CjmDeps, type CjmReport, type CjmSettings } from '../../../../scripts/check-cjm.js';
import { containsTerm, runCases, scoreRun, validateDataset, type Observation } from '../../../../scripts/calibration/evaluate.js';
import { prepareCorpus } from '../../../../scripts/calibration/live-store.js';

const rawQuestions = JSON.parse(readFileSync(new URL('../../../../tests/calibration/questions.json', import.meta.url), 'utf8'));
const rawCorpus = JSON.parse(readFileSync(new URL('../../../../tests/calibration/corpus.json', import.meta.url), 'utf8'));
const { questions, corpus } = validateDataset(rawQuestions, rawCorpus);
const good = (): Observation[] => questions.map((q) => {
  const doc = corpus.find((d) => d.key === q.document_key)!;
  const hits: ChunkHit[] = [{ id: q.id, documentId: doc.key, text: doc.text, sim: 0.8 }];
  return { id: q.id, status: 200, outcome: q.kind === 'known' ? 'answered' : 'model_unknown',
    answer_text: q.kind === 'known' ? doc.text : 'В материалах сайта нет ответа. Свяжитесь: fixture@example.test',
    citations: q.kind === 'known' ? [{ chunk_id: q.id, url: doc.url }] : [], hits, elapsed_ms: 15, usage: null };
});

describe('F16 SC-US-006-4 frozen data and honest scorer', () => {
  it('REL-01 frozen HTML contains every exact corpus paragraph; evidence is present', () => {
    const html = readFileSync(new URL('../../../../tests/calibration/site.html', import.meta.url), 'utf8');
    for (const d of corpus) expect(html).toContain(d.text);
    expect(questions.filter((q) => q.kind === 'known')).toHaveLength(20);
    expect(questions.filter((q) => q.kind === 'unknown')).toHaveLength(10);
    for (const q of questions.filter((q) => q.kind === 'unknown')) expect(q.missing_detail).toBeTruthy();
    expect(prepareCorpus(corpus).texts.length).toBeGreaterThan(0);
  });
  it.each(['short', 'duplicate-id', 'duplicate-text', 'wrong-split', 'missing-evidence', 'bad-term', 'missing-detail', 'bad-url'])(
    'REL-01 rejects dataset defect %s', (defect) => {
      const qs = structuredClone(rawQuestions); const cs = structuredClone(rawCorpus);
      switch (defect) {
        case 'short': qs.pop(); break;
        case 'duplicate-id': qs[1].id = qs[0].id; break;
        case 'duplicate-text': qs[1].question = qs[0].question; break;
        case 'wrong-split': qs[20].kind = 'known'; break;
        case 'missing-evidence': qs[0].evidence = 'unsupported fact'; break;
        case 'bad-term': qs[0].terms = [['unavailable fact']]; break;
        case 'missing-detail': delete qs[20].missing_detail; break;
        case 'bad-url': cs[0].url = 'https://username:password@example.test'; break;
      }
      expect(() => validateDataset(qs, cs)).toThrow('invalid_frozen_dataset');
    });
  it('REL-03 exactly 17/20 known with all high-sim unknown passes; 16/20 fails', () => {
    const samples = good();
    for (const s of samples.slice(17, 20)) { s.outcome = 'model_unknown'; s.citations = []; }
    expect(scoreRun(questions, corpus, samples, 0.7).passed).toBe(true);
    samples[16]!.answer_text = 'price not provided';
    expect(scoreRun(questions, corpus, samples, 0.7).passed).toBe(false);
  });
  it('REL-03 one low-sim unknown cannot pass even with a refusal', () => {
    const samples = good(); samples[20]!.hits[0] = { ...samples[20]!.hits[0]!, sim: 0.69 };
    const result = scoreRun(questions, corpus, samples, 0.7);
    expect(result.unknown_correct).toBe(9); expect(result.passed).toBe(false);
  });
  it.each(['below_threshold', 'invalid_citation', 'answered'])('REL-03 unknown outcome %s cannot replace model_unknown', (outcome) => {
    const samples = good(); samples[20]!.outcome = outcome;
    expect(scoreRun(questions, corpus, samples, 0.7).passed).toBe(false);
  });
  it('REL-03 legal source with wrong facts fails; number prefixes are not values', () => {
    const samples = good(); samples[0]!.answer_text = 'It costs 1200 credits';
    expect(scoreRun(questions, corpus, samples, 0.7).known_correct).toBe(19);
    expect(containsTerm('45 credits', '45')).toBe(true);
    expect(containsTerm('450 credits', '45')).toBe(false);
  });
  it.each(['wrong-source', 'unretrieved-id', 'low-sim-cite', 'empty-cite'])(
    'REL-03 rejects citation defect %s', (defect) => {
      const samples = good(); const s = samples[0]!;
      if (defect === 'wrong-source') s.citations[0]!.url = corpus[1]!.url;
      if (defect === 'unretrieved-id') s.citations[0]!.chunk_id = 'fabricated';
      if (defect === 'low-sim-cite') s.hits[0] = { ...s.hits[0]!, sim: 0.6 };
      if (defect === 'empty-cite') s.citations = [];
      expect(scoreRun(questions, corpus, samples, 0.7).known_correct).toBe(19);
    });
  it('REL-03 partial/duplicated observations and NaN similarity never pass', () => {
    const samples = good();
    expect(scoreRun(questions, corpus, samples.slice(0, 29), 0.7).passed).toBe(false);
    samples[29] = samples[28]!;
    expect(scoreRun(questions, corpus, samples, 0.7).passed).toBe(false);
    samples[20]!.hits[0] = { ...samples[20]!.hits[0]!, sim: NaN };
    expect(scoreRun(questions, corpus, samples, 0.7).cases[20]!.eligible).toBe(false);
  });
});

describe('F16 REL-02 budget and paid boundary', () => {
  it('missing live gate and fake mode refuse before runtime', async () => {
    expect(() => requireLive([], {})).toThrow();
    expect(() => requireLive(['--fake', '--seed-fixture', '--report', 'unused'], {
      CALIBRATION_LIVE_AUTHORIZED: 'yes', CALIBRATION_MODE: 'fake' })).toThrow();
    expect(() => requireLive(['--live', '--seed-fixture', '--report', 'unused'], {
      CALIBRATION_LIVE_AUTHORIZED: 'yes', CALIBRATION_MODE: 'live' })).toThrow();
    expect(await main([])).toBe(2);
  });
  it('capture delegates the existing attempt once and does not embed twice', async () => {
    const embed = vi.fn(async () => [1, 2]); const generate = vi.fn(async () => ({ answer: 'a', cited_ids: [], unknown: false,
      tokensIn: null, tokensOut: null }));
    const begin = vi.fn(async () => ({ embedQuestion: embed, generate }));
    const capture = vi.fn(async () => undefined);
    const boundary = { beginAnswer: begin, embedIndexBatch: vi.fn() } as unknown as PaidGateway;
    const attempt = await captureGateway(boundary, capture).beginAnswer({ kind: 'sandbox', accountId: 'test' }, { accountId: 'test', botId: 'bot' });
    expect(await attempt.embedQuestion('q')).toEqual([1, 2]); await attempt.generate([]);
    expect(begin).toHaveBeenCalledTimes(1); expect(embed).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1); expect(capture).toHaveBeenCalledWith([1, 2]);
  });
  it('REL-02 30 attempts sequential, no overlapping asks', async () => {
    const samples: Observation[] = []; let active = 0; let max = 0;
    const failure = await runCases(questions, async (q) => {
      active++; max = Math.max(active, max); await Promise.resolve(); active--;
      return good().find((s) => s.id === q.id)!;
    }, samples, 2_000_000, () => 0);
    expect(failure).toBeNull(); expect(samples).toHaveLength(30); expect(max).toBe(1);
  });
  it('REL-02 provider error stops immediately and preserves result with no retries', async () => {
    const samples: Observation[] = [];
    const ask = vi.fn(async () => ({ ...good()[0]!, status: 503, outcome: 'error' }));
    expect(await runCases(questions, ask, samples, 2_000_000, () => 0)).toBe('answer_unavailable');
    expect(ask).toHaveBeenCalledTimes(1); expect(samples).toHaveLength(1);
  });
  it('REL-02 thrown secret-bearing errors are not exposed and not retried', async () => {
    const ask = vi.fn(async (): Promise<Observation> => { throw new Error('private-marker'); });
    expect(await runCases(questions, ask, [], 2_000_000, () => 0)).toBe('case_execution_failed');
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('REL-02 deadline and reused attempt refuse before another ask', async () => {
    const ask = vi.fn();
    expect(await runCases(questions, ask, [], 35_000, () => 0)).toBe('run_deadline');
    expect(await runCases(questions, ask, good(), 2_000_000, () => 0)).toBe('invalid_attempt_budget');
    expect(ask).not.toHaveBeenCalled();
  });
  it('REL-02 oversized corpus cannot reserve a paid batch', () => {
    expect(() => prepareCorpus([{ ...corpus[0]!, text: 'word '.repeat(20_000) }])).toThrow('corpus_budget_exceeded');
  });
});

const ids = { account: '10000000-0000-4000-8000-000000000001', bot: '10000000-0000-4000-8000-000000000002',
  job: '10000000-0000-4000-8000-000000000003', chunk: '10000000-0000-4000-8000-000000000004', pub: 'Abcdef_12345' };
const settings: CjmSettings = { base: 'https://issued.example.test', foreign: 'https://foreign.example.test',
  source: 'https://fixture.example.test/site.html', expectedCitation: 'https://fixture.example.test/site.html',
  question: 'What is the price?', term: '120', ownerUrl: 'not-used', reportPath: 'not-used' };
function protocol(fault = '') {
  const seen: { route: string; method: string; origin: string | null; cookie: boolean }[] = [];
  let polls = 0;
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url)); const headers = new Headers(init?.headers);
    seen.push({ route: u.pathname, method: init?.method ?? 'GET', origin: headers.get('origin'), cookie: headers.has('cookie') });
    const response = (data: unknown, status = 200, h: Record<string, string> = {}) => Response.json({ data }, { status, headers: h });
    const answer = { outcome: 'answered', answer_text: '120 credits', citations: [{ chunk_id: ids.chunk, url: settings.source }] };
    const cors = { 'access-control-allow-origin': settings.foreign };
    if (u.pathname === '/api/auth/register') return response({ ok: true }, 201, { 'set-cookie': 'n6b_session=secret-session; HttpOnly' });
    if (u.pathname === '/api/bots') return response({ bot_id: ids.bot, public_id: ids.pub, job_id: ids.job }, fault === 'wrong202' ? 200 : 202);
    if (u.pathname.startsWith('/api/jobs/')) return response({ state: fault === 'unknown-job' ? 'mystery'
      : fault === 'failed-job' ? 'failed' : ++polls === 1 ? 'running' : 'succeeded' });
    if (u.pathname.endsWith('/publish')) return response({ published: true, public_id: ids.pub,
      embed_code: `<script src="${settings.base}/w.js" data-bot="${ids.pub}"></script>` });
    if (u.pathname.endsWith('/ask')) {
      if (init?.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors,
        'access-control-allow-methods': fault === 'bad-preflight' ? 'GET' : 'POST', 'access-control-allow-headers': 'Content-Type' } });
      return response(fault === 'uncited' ? { ...answer, citations: [] } : answer, 200,
        u.pathname.includes('/widget/') ? fault === 'bad-cors' ? { 'access-control-allow-origin': '*' } : cors : {});
    }
    if (u.pathname === '/api/widget/config') return response({ badge_required: true,
      badge_url: `${settings.base}/r/b/${ids.pub}`, privacy_notice: 'External model' }, 200, cors);
    if (u.pathname.startsWith('/r/b/')) return new Response(null, { status: 302,
      headers: { location: '/?ref=' + (fault === 'wrong-ref' ? 'wrong' : ids.pub) } });
    if (u.pathname === '/') return new Response('landing');
    throw new Error('unexpected-test-route');
  });
  const deps: CjmDeps = { fetch: fetcher as typeof fetch, markTest: vi.fn(async () => ids.account),
    verifyBot: vi.fn(async () => undefined), readLedger: vi.fn(async () => []), sleep: vi.fn(async () => undefined), now: () => 0 };
  return { deps, seen };
}
describe('F16 REL-04 CJM offline protocol boundary', () => {
  it('missing prerequisites exit2 without requests', async () => {
    expect(() => cjmSettings([], {})).toThrow(); expect(await cjmMain([])).toBe(2);
    expect(() => cjmSettings([settings.base], { CJM_RUN_AUTHORIZED: 'yes' })).toThrow();
  });
  it('real protocol order marks test before bot, sends no visitor cookie, follows ref', async () => {
    const { deps, seen } = protocol(); const report: CjmReport = { status: 'failed', stages: [] };
    expect(await runCjm(settings, deps, report)).toBe(0);
    expect(report.status).toBe('passed_api_protocol');
    expect(report.stages.map((s) => s.stage)).toContain('mark_is_test_owner_db');
    expect(seen.filter((s) => s.route.includes('/ask') && s.method === 'POST')).toHaveLength(2);
    expect(seen.filter((s) => s.route.includes('/widget/')).every((s) => !s.cookie && s.origin === settings.foreign)).toBe(true);
    expect(deps.markTest).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain('secret-session');
  });
  it.each(['wrong202', 'unknown-job', 'failed-job', 'uncited', 'bad-cors', 'bad-preflight', 'wrong-ref'])(
    'REL-04 protocol defect %s fails without retry', async (fault) => {
      const { deps, seen } = protocol(fault); const report: CjmReport = { status: 'failed', stages: [] };
      expect(await runCjm(settings, deps, report)).toBe(1); expect(report.status).toBe('failed');
      expect(seen.filter((s) => s.route === '/api/bots')).toHaveLength(1);
    });
  it('REL-04 owner marking failure cannot reach queued indexing/paid answer', async () => {
    const { deps, seen } = protocol(); deps.markTest = async () => { throw new Error('secret-db-url'); };
    const report: CjmReport = { status: 'failed', stages: [] };
    expect(await runCjm(settings, deps, report)).toBe(1);
    expect(seen).toHaveLength(1); expect(JSON.stringify(report)).not.toContain('secret-db-url');
  });
});
