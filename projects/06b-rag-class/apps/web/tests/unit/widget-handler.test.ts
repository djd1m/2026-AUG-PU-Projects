import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Pool, visitorKey } from '@n6b/db';
import type { PaidGateway } from '@n6b/rag';
import { createWidgetHandler } from '@/server/widget-handler';
import { badgeRequired, requestOrigin, PRIVACY_NOTICE } from '@/server/widget-policy';
import { metricHost, excludedMetricHost } from '@/server/metric-host';

const m = vi.hoisted(() => ({ read: vi.fn(), config: vi.fn(), question: vi.fn(), event: vi.fn(), answer: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), readWidgetBot: m.read,
  recordWidgetConfig: m.config, recordWidgetQuestion: m.question, recordWidgetEvent: m.event }));
vi.mock('@n6b/rag', async (original) => ({ ...await original<object>(), answerQuestion: m.answer }));
const ID = 'abcdefghijkl';
const ORIGIN = 'https://www.shop.example';
const bot = { id: '11111111-1111-1111-1111-111111111111', accountId: '22222222-2222-2222-2222-222222222222',
  public_id: ID, name: 'Shop', contact: 'owner@example.test', allowed_origins: [ORIGIN],
  plan: 'free', badge_removal: 'active', metric_eligible: true };
const deps = { servicePool: {} as Pool, gateway: {} as PaidGateway, publicBaseUrl: 'https://widget.example',
  visitorSecret: 'test-secret', minSimilarity: 0.7, now: () => new Date('2026-10-02T12:00:00Z'), log: () => undefined };
const handler = (kind: 'ask' | 'config' | 'event') => createWidgetHandler(kind, deps);
function request(kind: 'ask' | 'config' | 'event', body: unknown = { question: 'test' }, origin: string | null = ORIGIN,
  method = kind === 'config' ? 'GET' : 'POST', query = `bot=${ID}&page=${encodeURIComponent(`${ORIGIN}/contacts`)}`) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1, 203.0.113.99' };
  if (origin !== null) headers.origin = origin;
  return new Request(`https://widget.example/api/widget/${kind}?${query}`, { method, headers,
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks(); m.read.mockResolvedValue(bot);
  m.answer.mockResolvedValue({ status: 200, data: { answer_text: 'ok', citations: [], outcome: 'below_threshold', show_cta: false } });
});
describe('WID-02/03 shared public gate', () => {
  it.each([null, '', 'null', 'https://foreign.example', `${ORIGIN}/path`, `${ORIGIN}/`, `${ORIGIN}?x=1`,
    `${ORIGIN}#fragment`, 'https://user@www.shop.example', 'https://www.shop.example:444', 'https://www.shop.example\\foo'])
  ('denies Origin %s before answer/config/event with no CORS', async (origin) => {
    for (const kind of ['config', 'ask', 'event'] as const) {
      const response = await handler(kind)(request(kind, { kind: 'impression', question: 'test' }, origin));
      expect(response.status).toBe(403); expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(m.answer).not.toHaveBeenCalled(); expect(m.config).not.toHaveBeenCalled(); expect(m.event).not.toHaveBeenCalled();
  });
  it('empty allowlist and unpublished/missing bots are closed', async () => {
    m.read.mockResolvedValue({ ...bot, allowed_origins: [] });
    expect((await handler('ask')(request('ask'))).status).toBe(403);
    m.read.mockResolvedValue(null);
    expect((await handler('ask')(request('ask'))).status).toBe(404);
    expect(m.answer).not.toHaveBeenCalled();
  });
  it('query bot is bounded, singular and required even for preflight', async () => {
    for (const query of ['', 'bot=bad', `bot=${ID}&bot=${ID}`]) {
      expect((await handler('ask')(request('ask', {}, ORIGIN, 'OPTIONS', query))).status).toBe(404);
    }
    expect(m.read).not.toHaveBeenCalled();
  });
  it('OPTIONS has no body/IP requirement and uses the same origin gate', async () => {
    const req = request('ask', undefined, 'https://WWW.shop.example:443', 'OPTIONS'); req.headers.delete('x-forwarded-for');
    const res = await handler('ask')(req);
    expect(res.status).toBe(204); expect(await res.text()).toBe('');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Vary')).toBe('Origin'); expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect((await handler('ask')(request('ask', {}, 'https://foreign.example', 'OPTIONS'))).status).toBe(403);
    expect(m.answer).not.toHaveBeenCalled();
  });
  it.each([{}, [], null, { question: '' }, { question: '  ' }, { question: 1 }, { question: 'x'.repeat(501) },
    { question: 'ok', bot: 'different_id' }, '{bad', '"too-large"'])('invalid body %j never reserves', async (body) => {
    expect((await handler('ask')(request('ask', body))).status).toBe(422); expect(m.answer).not.toHaveBeenCalled();
  });
  it('bounds actual bytes and content type; absent/invalid trusted IP fails closed', async () => {
    expect((await handler('ask')(request('ask', { question: 'ok', padding: 'x'.repeat(4096) }))).status).toBe(413);
    const badType = request('ask'); badType.headers.set('content-type', 'application/json-evil');
    expect((await handler('ask')(badType)).status).toBe(422);
    for (const ip of ['', 'spoof, invalid']) {
      const req = request('ask'); req.headers.set('x-forwarded-for', ip);
      expect((await handler('ask')(req)).status).toBe(503);
    }
    expect(m.answer).not.toHaveBeenCalled(); expect(m.question).not.toHaveBeenCalled();
  });
  it('server derives owner/channel/HMAC from final XFF and internal bot; valid 500-char question', async () => {
    const question = 'я'.repeat(500);
    const res = await handler('ask')(request('ask', { question, bot: ID, accountId: 'evil', channel: 'sandbox', visitor_key: 'evil' }));
    expect(res.status).toBe(200);
    expect(m.answer).toHaveBeenCalledWith(deps, { bot, question, channel: { kind: 'visitor', ip: '203.0.113.99', botId: bot.id },
      logChannel: 'widget', visitorKey: visitorKey(deps.visitorSecret, '203.0.113.99', bot.id), originHost: 'shop.example' });
    expect(m.question).toHaveBeenCalledWith(deps.servicePool, bot, 'shop.example');
  });
  it.each([429, 503])('preserves %s/contact/retry without install mark; next accepted attempt recovers', async (status) => {
    m.answer.mockResolvedValueOnce({ status, error: { code: 'limited', message: 'later', retryAfterSeconds: 42 }, contact: bot.contact });
    const res = await handler('ask')(request('ask'));
    expect(res.status).toBe(status); expect(res.headers.get('Retry-After')).toBe('42');
    expect(await res.json()).toMatchObject({ contact: bot.contact }); expect(m.question).not.toHaveBeenCalled();
    expect((await handler('ask')(request('ask'))).status).toBe(200); expect(m.question).toHaveBeenCalledOnce();
  });
  it('database failures expose no internal detail', async () => {
    m.read.mockRejectedValue(new Error('secret connection'));
    const res = await handler('config')(request('config')); expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('secret'); expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
describe('WID-04/05 policy and bounded events', () => {
  it('SC-US-009-1/2: Free and every non-exact plan require badge even with active removal', () => {
    for (const plan of ['free', null, undefined, '', 'PAID', ' start', 'Start', ['start'], {}, 1, true]) {
      expect(badgeRequired(plan, 'active')).toBe(true);
    }
    for (const plan of ['start', 'studio']) {
      expect(badgeRequired(plan, 'active')).toBe(false);
      for (const removal of [null, 'none', 'ACTIVE', ['active'], ' active']) expect(badgeRequired(plan, removal)).toBe(true);
    }
  });
  it('SC-US-008-4: server privacy, badge URL and default required badge in config', async () => {
    const res = await handler('config')(request('config'));
    expect(await res.json()).toMatchObject({ data: { privacy_notice: PRIVACY_NOTICE, badge_required: true,
      badge_url: `https://widget.example/r/b/${ID}` } });
    expect(m.config).toHaveBeenCalledWith(deps.servicePool, bot, 'shop.example', `${ORIGIN}/contacts`);
  });
  it('only impression/tamper accepted; key/day cannot be selected by the client', async () => {
    for (const kind of ['click', 'badge_removal_intent', '', null]) {
      expect((await handler('event')(request('event', { kind }))).status).toBe(422);
    }
    expect(m.event).not.toHaveBeenCalled();
    for (const kind of ['impression', 'tamper']) {
      expect((await handler('event')(request('event', { kind, visitor_key: 'evil', day: '2000-01-01' }))).status).toBe(204);
      expect(m.event).toHaveBeenLastCalledWith(deps.servicePool, bot, kind,
        visitorKey(deps.visitorSecret, '203.0.113.99', bot.id), deps.now());
    }
  });
});
describe('WID-06 metric normalization/exclusions', () => {
  it('one normalization for page/origin, exact preview boundaries and own host', () => {
    expect(metricHost('https://WWW.Shop.Example/a')).toBe('shop.example');
    for (const host of ['widget.example', 'www.widget.example', 'localhost', '127.0.0.1', '[::1]', '10.0.0.1',
      'foo.local', 'x.vercel.app', 'x.netlify.app', 'x.github.io', 'x.tilda.ws', 'x.pages.dev']) {
      expect(excludedMetricHost(metricHost(`https://${host}`)!, deps.publicBaseUrl)).toBe(true);
    }
    expect(excludedMetricHost('vercel.app.evil.example', deps.publicBaseUrl)).toBe(false);
    for (const raw of ['invalid', 'data:text/plain,x', 'https://user:pass@shop.example', 'x'.repeat(2049)]) expect(metricHost(raw)).toBeNull();
    expect(requestOrigin('https://WWW.shop.example:443')).toBe(ORIGIN);
  });
  it('mismatched/invalid page, excluded host and test/operator account do not write installs', async () => {
    for (const page of ['https://foreign.example', 'invalid', 'x'.repeat(2049)]) {
      expect((await handler('config')(request('config', {}, ORIGIN, 'GET', `bot=${ID}&page=${encodeURIComponent(page)}`))).status).toBe(200);
    }
    m.read.mockResolvedValue({ ...bot, metric_eligible: false });
    await handler('config')(request('config')); await handler('ask')(request('ask'));
    m.read.mockResolvedValue({ ...bot, allowed_origins: ['https://x.vercel.app'] });
    await handler('config')(request('config', {}, 'https://x.vercel.app', 'GET', `bot=${ID}&page=https://x.vercel.app`));
    expect(m.config).not.toHaveBeenCalled(); expect(m.question).not.toHaveBeenCalled();
  });
});
