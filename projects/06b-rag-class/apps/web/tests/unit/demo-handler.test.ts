import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Pool, visitorKey } from '@n6b/db';
import type { PaidGateway } from '@n6b/rag';
import { createDemoHandler } from '@/server/demo-handler';

const m = vi.hoisted(() => ({ read: vi.fn(), answer: vi.fn(), install: vi.fn(), config: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), readDemoBot: m.read,
  recordWidgetQuestion: m.install, recordWidgetConfig: m.config }));
vi.mock('@n6b/rag', async (original) => ({ ...await original<object>(), answerQuestion: m.answer }));
const BASE = 'https://demo.example';
const SLUG = 'server_owned_demo_slug';
const bot = { id: '11111111-1111-1111-1111-111111111111', accountId: '22222222-2222-2222-2222-222222222222',
  public_id: 'abcdefghijkl', name: 'Demo', contact: 'owner@example.test', plan: 'free', badge_removal: 'none' };
const deps = { servicePool: {} as Pool, gateway: {} as PaidGateway, publicBaseUrl: `${BASE}/prefix`,
  visitorSecret: 'secret', minSimilarity: 0.7, log: () => undefined };
const handler = createDemoHandler(deps);
function request(body: unknown = { question: 'Вопрос?' }, origin: string | null = BASE,
  type: string | null = 'application/json', method = 'POST') {
  const headers: Record<string, string> = { 'x-forwarded-for': '192.0.2.1, 203.0.113.99' };
  if (origin !== null) headers.origin = origin;
  if (type !== null) headers['content-type'] = type;
  return new Request(`${BASE}/api/demo/${SLUG}/ask`, { method, headers,
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks(); m.read.mockResolvedValue(bot);
  m.answer.mockResolvedValue({ status: 200, data: { answer_text: 'ok', citations: [], outcome: 'below_threshold', show_cta: false } });
});

describe('DEM-01/03 SC-US-012-5 demo request gate', () => {
  it.each([null, '', 'null', 'https://foreign.example', `${BASE}/path`, `${BASE}/`, `${BASE}?x=1`, `${BASE}#x`,
    'https://user@demo.example', 'https://demo.example:444', 'https://demo.example\\evil', `${BASE} https://other.test`])
  ('rejects serialized Origin %s before lookup/admission; no CORS', async (origin) => {
    const res = await handler(request(undefined, origin), SLUG);
    expect(res.status).toBe(403); expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(m.read).not.toHaveBeenCalled(); expect(m.answer).not.toHaveBeenCalled();
  });
  it.each([null, '', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x',
    'application/json-evil', 'text/json'])('rejects media %s before lookup/admission', async (type) => {
    const res = await handler(request(undefined, BASE, type), SLUG);
    expect(res.status).toBe(403); expect(m.read).not.toHaveBeenCalled(); expect(m.answer).not.toHaveBeenCalled();
  });
  it('accepts normalized origin/default port and JSON charset, ignoring all client authority', async () => {
    const question = 'я'.repeat(500);
    const res = await handler(request({ question, bot: 'spoof', accountId: 'spoof', channel: 'sandbox', visitor_key: 'spoof' },
      'https://DEMO.example:443', 'Application/JSON; charset=utf-8'), SLUG);
    expect(res.status).toBe(200); expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(m.answer).toHaveBeenCalledWith(deps, { bot, question,
      channel: { kind: 'visitor', ip: '203.0.113.99', botId: bot.id }, logChannel: 'demo',
      visitorKey: visitorKey(deps.visitorSecret, '203.0.113.99', bot.id) });
    expect(m.install).not.toHaveBeenCalled(); expect(m.config).not.toHaveBeenCalled();
  });
  it('unknown/disabled/unpublished reader results and bounded invalid slugs give identical 404', async () => {
    for (const slug of ['bad', 'x'.repeat(65), '../abcdefghijkl', 'abcdefghijkl?x=1']) {
      expect((await handler(request(), slug)).status).toBe(404);
    }
    expect(m.read).not.toHaveBeenCalled();
    m.read.mockResolvedValue(null);
    expect((await handler(request(), SLUG)).status).toBe(404); expect(m.answer).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, '{bad', '"too-large"', { question: '' }, { question: '  ' }, { question: 2 },
    { question: 'x'.repeat(501) }])('invalid JSON/question %j never admits', async (body) => {
    expect((await handler(request(body), SLUG)).status).toBe(422); expect(m.answer).not.toHaveBeenCalled();
  });
  it('actual byte bound, missing trusted IP and OPTIONS are closed before admission', async () => {
    const oversized = request({ question: 'ok', padding: 'x'.repeat(4096) }); oversized.headers.set('content-length', '1');
    expect((await handler(oversized, SLUG)).status).toBe(413);
    const noIp = request(); noIp.headers.delete('x-forwarded-for');
    expect((await handler(noIp, SLUG)).status).toBe(503);
    const options = await handler(request(undefined, 'https://foreign.example', null, 'OPTIONS'), SLUG);
    expect(options.status).toBe(405);
    for (const [name] of options.headers) expect(name.toLowerCase().startsWith('access-control')).toBe(false);
    expect(m.answer).not.toHaveBeenCalled();
  });
  it.each([429, 503])('preserves %s/contact/Retry-After and permits a later retry', async (status) => {
    m.answer.mockResolvedValueOnce({ status, error: { code: 'limited', message: 'later', retryAfterSeconds: 47 }, contact: bot.contact });
    const res = await handler(request(), SLUG);
    expect(res.status).toBe(status); expect(res.headers.get('Retry-After')).toBe('47');
    expect(await res.json()).toMatchObject({ contact: bot.contact });
    expect((await handler(request(), SLUG)).status).toBe(200); expect(m.install).not.toHaveBeenCalled();
  });
  it('database errors expose no secrets', async () => {
    m.read.mockRejectedValue(new Error('secret database uri'));
    const res = await handler(request(), SLUG); expect(res.status).toBe(503); expect(await res.text()).not.toContain('secret');
  });
});
