import type { AnswerResponse, ChunkHit } from '@n6b/rag';

export interface CorpusDocument { key: string; title: string; url: string; text: string }
export interface Question {
  id: string; kind: 'known' | 'unknown'; question: string; document_key: string;
  evidence?: string; terms?: string[][]; missing_detail?: string;
}
export interface Observation {
  id: string; status: number; outcome: string; answer_text: string;
  citations: { chunk_id: string; url: string | null }[]; hits: ChunkHit[];
  elapsed_ms: number; usage: unknown;
}

export function validateDataset(rawQuestions: unknown, rawCorpus: unknown): {
  questions: Question[]; corpus: CorpusDocument[];
} {
  const fail = (): never => { throw new Error('invalid_frozen_dataset'); };
  if (!Array.isArray(rawQuestions) || rawQuestions.length !== 30
    || !Array.isArray(rawCorpus) || !rawCorpus.length || rawCorpus.length > 20) return fail();
  const corpus = rawCorpus as CorpusDocument[];
  const nonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
  const keys = new Set<string>();
  for (const d of corpus) {
    if (!d || !nonempty(d.key) || keys.has(d.key) || !nonempty(d.title) || !nonempty(d.text)
      || Buffer.byteLength(d.text, 'utf8') > 8000) return fail();
    let url: URL;
    try { url = new URL(d.url); } catch { return fail(); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return fail();
    keys.add(d.key);
  }
  const questions = rawQuestions as Question[];
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const q of questions) {
    if (!q || !nonempty(q.id) || ids.has(q.id) || !nonempty(q.question) || q.question.length > 500
      || texts.has(q.question) || !keys.has(q.document_key)) return fail();
    const doc = corpus.find((d) => d.key === q.document_key)!;
    if (q.kind === 'known') {
      if (!nonempty(q.evidence) || !doc.text.includes(q.evidence) || !Array.isArray(q.terms)
        || !q.terms.length || q.terms.some((g) => !Array.isArray(g) || !g.length
          || g.some((t) => !nonempty(t)) || !g.some((t) => containsTerm(q.evidence!, t)))) return fail();
    } else if (q.kind !== 'unknown' || !nonempty(q.missing_detail)) return fail();
    ids.add(q.id); texts.add(q.question);
  }
  if (questions.filter((q) => q.kind === 'known').length !== 20
    || questions.filter((q) => q.kind === 'unknown').length !== 10) return fail();
  return { questions, corpus };
}

const normalize = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function containsTerm(text: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text));
}

export function scoreRun(questions: readonly Question[], corpus: readonly CorpusDocument[],
  observations: readonly Observation[], minSimilarity: number) {
  validateDataset(questions, corpus);
  if (!Number.isFinite(minSimilarity) || minSimilarity <= 0 || minSimilarity >= 1) throw new Error('invalid_threshold');
  const unique = new Set(observations.map((s) => s.id));
  const complete = observations.length === 30 && unique.size === 30
    && questions.every((q) => unique.has(q.id));
  const cases = questions.map((q) => {
    const s = observations.find((s) => s.id === q.id);
    const top = s?.hits.length ? Math.max(...s.hits.map((h) => h.sim)) : null;
    const eligible = top !== null && Number.isFinite(top) && top >= minSimilarity;
    const expectedUrl = corpus.find((d) => d.key === q.document_key)!.url;
    const factual = q.kind === 'known' && !!s && q.terms!.every((g) => g.some((t) => containsTerm(s.answer_text, t)));
    const validCitation = !!s && s.citations.length > 0 && s.citations.every((c) =>
      s.hits.some((h) => h.id === c.chunk_id && h.sim >= minSimilarity))
      && s.citations.some((c) => c.url === expectedUrl);
    const passed = s?.status === 200 && eligible && (q.kind === 'unknown'
      ? s.outcome === 'model_unknown' && s.citations.length === 0
      : s.outcome === 'answered' && factual && validCitation);
    return { id: q.id, kind: q.kind, passed, eligible, top_similarity: top,
      factual, valid_expected_citation: validCitation, expected_evidence: q.evidence ?? q.missing_detail,
      observation: s ?? null };
  });
  const known = cases.filter((c) => c.kind === 'known' && c.passed).length;
  const unknown = cases.filter((c) => c.kind === 'unknown' && c.passed).length;
  return { passed: complete && known >= 17 && unknown === 10, complete,
    known_correct: known, unknown_correct: unknown, cases };
}

export function observe(id: string, response: AnswerResponse, hits: ChunkHit[], elapsed: number, usage: unknown): Observation {
  return { id, status: response.status, outcome: response.status === 200 ? response.data.outcome : 'error',
    answer_text: response.status === 200 ? response.data.answer_text : '',
    citations: response.status === 200 ? [...response.data.citations] : [], hits, elapsed_ms: elapsed, usage };
}

export async function runCases(questions: readonly Question[], ask: (q: Question) => Promise<Observation>,
  observations: Observation[], deadline: number, now: () => number = Date.now): Promise<string | null> {
  if (questions.length !== 30 || observations.length !== 0) return 'invalid_attempt_budget';
  for (const q of questions) {
    if (now() + 35_000 >= deadline) return 'run_deadline';
    const before = now();
    try {
      const result = await ask(q);
      observations.push(result);
      if (now() >= deadline) return 'run_deadline';
      if (result.status !== 200) return 'answer_unavailable';
    } catch {
      observations.push({ id: q.id, status: 503, outcome: 'error', answer_text: '', citations: [], hits: [],
        elapsed_ms: Math.max(0, now() - before), usage: null });
      return 'case_execution_failed';
    }
  }
  return null;
}
