// source-lifecycle без БД: порядок входа и коды ответов «Обновить»/«Удалить» (лимит → Origin → сессия → владение),
// ответы на предел запусков, и стражи по исходнику — предел фрагментов стоит ДО эмбеддинга в обоих обработчиках,
// уборка исчезнувших страниц — только за условием полного обхода без временных пропусков.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSourceDeleteHandler, createSourceReindexHandler, type CabinetDependencies } from '../apps/web/src/server/cabinet-handler';
import { TRANSIENT_SKIPS } from '../apps/worker/src/crawl/site-processor';

const ORIGIN = 'https://sufler.test.invalid';
const SOURCE = '44444444-4444-4444-8444-444444444444';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function deps(calls: string[], over: Partial<CabinetDependencies> = {}): CabinetDependencies {
  const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
  return {
    publicOrigin: ORIGIN, authenticate: async () => { calls.push('auth'); return { account_id: ACCOUNT }; },
    allowMutation: async () => { calls.push('limit'); return true; },
    listBots: touch('list'), createBot: touch('create'), newPublicKey: () => 'k', updateSettings: touch('update'), addOrigin: touch('origin'),
    checkAddress: touch('check'), ownsBot: touch('owns'), createSite: touch('site'), findJob: touch('find'), reindex: touch('reindex'), deleteSource: touch('delete-source'),
    enqueue: touch('enqueue'), answer: touch('answer'), setVerified: touch('verify'), publish: touch('publish'), summary: touch('summary'), log: () => {}, ...over,
  } as CabinetDependencies;
}
const request = (method: string, headers: Record<string, string>) => new Request(`${ORIGIN}/api/sources/${SOURCE}`, { method,
  headers: { 'x-forwarded-for': '93.184.1.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${'A'.repeat(43)}`, ...headers },
  body: method === 'DELETE' ? undefined : '{}' });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

describe('«Удалить» и «Обновить» источник: порядок входа', () => {
  it('чужой и пустой Origin — 403 до владения и удаления; лимит исчерпан — 429 до всего', async () => {
    for (const handler of [createSourceDeleteHandler, createSourceReindexHandler]) {
      for (const origin of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
        const calls: string[] = [];
        const r = await handler(deps(calls))(request(handler === createSourceDeleteHandler ? 'DELETE' : 'POST', origin), SOURCE);
        expect(r.status).toBe(403);
        expect(calls).toEqual(['auth', 'limit']);
      }
      const calls: string[] = [];
      const limited = await handler(deps(calls, { allowMutation: async () => { calls.push('limit'); return false; } }))(request('POST', { origin: ORIGIN }), SOURCE);
      expect(limited.status).toBe(429);
      expect(calls).toEqual(['auth', 'limit']);
    }
  });
  it('непригодный id — 404 без обращения к БД; чужой (null) — 404; удаление — 204 без тела', async () => {
    const calls: string[] = [];
    expect((await createSourceDeleteHandler(deps(calls))(request('DELETE', { origin: ORIGIN }), 'not-a-uuid')).status).toBe(404);
    expect(calls).not.toContain('delete-source');
    const seen: unknown[] = [];
    const gone = await createSourceDeleteHandler(deps([], { deleteSource: async (...a) => { seen.push(a); return null; } }))(request('DELETE', { origin: ORIGIN }), SOURCE);
    expect(gone.status).toBe(404);
    const ok = await createSourceDeleteHandler(deps([], { deleteSource: async (...a) => { seen.push(a); return { deleted: true, chunks: 3 }; } }))(request('DELETE', { origin: ORIGIN }), SOURCE);
    expect([ok.status, await ok.text()]).toEqual([204, '']);
    expect(seen[1]).toEqual([SOURCE, ACCOUNT]);
  });
  it('«Обновить»: queued — 202 и постановка; running — 202 тот же id БЕЗ постановки; pdf — 409 reupload; предел — 429 index_starts; null — 404', async () => {
    const enqueued: unknown[] = [];
    const run = (result: Awaited<ReturnType<CabinetDependencies['reindex']>>) => createSourceReindexHandler(deps([], {
      reindex: async () => result, enqueue: async (m) => { enqueued.push(m); } }))(request('POST', { origin: ORIGIN }), SOURCE);
    const queued = await run({ kind: 'queued', message: { index_job_id: SOURCE, generation: 3 } });
    expect([queued.status, await queued.json()]).toEqual([202, { data: { index_job_id: SOURCE } }]);
    expect(enqueued).toEqual([{ index_job_id: SOURCE, generation: 3 }]);
    const running = await run({ kind: 'running', indexJobId: SOURCE });
    expect([running.status, await running.json()]).toEqual([202, { data: { index_job_id: SOURCE } }]);
    expect(enqueued).toHaveLength(1);
    const pdf = await run({ kind: 'pdf_reupload' });
    expect([pdf.status, await code(pdf)]).toEqual([409, 'reupload']);
    const limited = await run({ kind: 'daily_limit', limit: 20 });
    expect([limited.status, await code(limited)]).toEqual([429, 'index_starts']);
    expect((await run(null)).status).toBe(404);
  });
});

describe('стражи по исходнику (source-lifecycle)', () => {
  const site = readFileSync('apps/worker/src/crawl/site-processor.ts', 'utf8');
  const pdf = readFileSync('apps/worker/src/pdf/pdf-processor.ts', 'utf8');
  it('предел фрагментов — ДО эмбеддинга в обработчиках сайта и PDF (лишнее не оплачивается)', () => {
    for (const [name, code] of [['site', site], ['pdf', pdf]] as const) {
      const cap = code.indexOf('capPageChunks(chunkDocument(');
      const embed = code.indexOf('options.embedder.embed(lease, chunks)');
      expect(cap, name).toBeGreaterThan(0);
      expect(embed, name).toBeGreaterThan(cap);
      expect(code, name).toMatch(/chunksDropped: dropped/);
    }
  });
  it('уборка исчезнувших страниц — только при полном обходе без временных пропусков; http_error и сеть — временные', () => {
    expect(site).toMatch(/if \(result\.stoppedBy === 'exhausted' && transient === 0\) pruned = await pruneUnseenPages\(/);
    expect(site.match(/pruneUnseenPages\(/g)).toHaveLength(1); // единственный вызов (в импорте скобки нет)
    expect([...TRANSIENT_SKIPS].sort()).toEqual(['http_error', 'robots_unreachable', 'timeout', 'too_many_redirects', 'unreachable']);
  });
});
