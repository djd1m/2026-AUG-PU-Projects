import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import type { PaidGateway } from '@n6b/rag';
import { createAskHandler } from '@/server/ask-handler';

const mocks = vi.hoisted(() => ({ read: vi.fn(), answer: vi.fn(), authenticate: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), readAnswerBot: mocks.read }));
vi.mock('@n6b/rag', async (original) => ({ ...await original<object>(), answerQuestion: mocks.answer }));
const BOT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://sandbox.test';
const token = 'a'.repeat(43);
const handler = createAskHandler({ publicBaseUrl: BASE, authenticate: mocks.authenticate,
  tenantPool: {} as Pool, servicePool: {} as Pool, gateway: {} as PaidGateway, minSimilarity: 0.7, log: () => undefined });
function post(body: string, extra: Record<string, string> = {}) {
  return new Request(`${BASE}/api/bots/${BOT}/ask`, { method: 'POST', body,
    headers: { origin: BASE, cookie: `n6b_session=${token}`, 'content-type': 'application/json', ...extra } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(ACCOUNT);
  mocks.read.mockResolvedValue({ id: BOT, accountId: ACCOUNT, contact: null });
  mocks.answer.mockResolvedValue({ status: 200, data: { answer_text: 'ok', citations: [], outcome: 'model_unknown', show_cta: false } });
});
describe('ANS-01: gates before answer gateway', () => {
  it.each(['', 'https://foreign.test', 'null'])('origin %s refuses before session or answer', async (origin) => {
    expect((await handler(post('{"question":"test"}', { origin }), BOT)).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('absent origin refuses before authentication', async () => {
    const req = post('{"question":"test"}'); req.headers.delete('origin');
    expect((await handler(req, BOT)).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('session and UUID validation refuse before answer', async () => {
    expect((await handler(post('{"question":"test"}', { cookie: '' }), BOT)).status).toBe(401);
    expect((await handler(post('{"question":"test"}'), 'not-uuid')).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.answer).not.toHaveBeenCalled();
  });
  it.each([{}, [], { question: '' }, { question: '  ' }, { question: 12 }, { question: 'x'.repeat(501) }, null])(
    'invalid question %j refuses', async (body) => {
      expect((await handler(post(JSON.stringify(body)), BOT)).status).toBe(422);
      expect(mocks.answer).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
    });
  it('malformed or wrong-content-type JSON refuses; stream bytes bounded despite dishonest Content-Length', async () => {
    expect((await handler(post('{bad'), BOT)).status).toBe(422);
    expect((await handler(post('{}', { 'content-type': 'text/plain' }), BOT)).status).toBe(422);
    expect((await handler(post(JSON.stringify({ question: 'x', padding: 'x'.repeat(4096) }), { 'content-length': '1' }), BOT)).status).toBe(413);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('foreign bot refuses before answer', async () => {
    mocks.read.mockResolvedValue(null);
    expect((await handler(post('{"question":"test"}'), BOT)).status).toBe(404);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('body cannot select account, visitor or channel; 500-character question is valid', async () => {
    const question = 'я'.repeat(500);
    expect((await handler(post(JSON.stringify({ question, accountId: 'foreign', channel: 'visitor', visitor_key: 'fake' })), BOT)).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), ACCOUNT, BOT);
    expect(mocks.answer.mock.calls[0]![1]).toEqual({ bot: { id: BOT, accountId: ACCOUNT, contact: null }, question,
      channel: { kind: 'sandbox', accountId: ACCOUNT }, logChannel: 'sandbox' });
  });
  it('safe quota response exposes Retry-After and contact; database failures disclose no detail', async () => {
    mocks.answer.mockResolvedValue({ status: 429, error: { code: 'limit_sandbox_account', message: 'limit', retryAfterSeconds: 42 }, contact: 'owner' });
    const response = await handler(post('{"question":"test"}'), BOT);
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('42');
    mocks.read.mockRejectedValue(new Error('secret DB connection string'));
    expect(await (await handler(post('{"question":"test"}'), BOT)).text()).not.toContain('secret');
  });
  it('STU-04: studio remains lookup actor, sandbox quota uses the RLS-resolved child owner', async () => {
    const childId = '33333333-3333-3333-3333-333333333333';
    mocks.read.mockResolvedValue({ id: BOT, accountId: childId, contact: null });
    expect((await handler(post('{"question":"test"}'), BOT)).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), ACCOUNT, BOT);
    expect(mocks.answer.mock.calls[0]![1].channel).toEqual({ kind: 'sandbox', accountId: childId });
  });
});
