import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import { createStudioClientHandler } from '@/server/studio-handler';

const mocks = vi.hoisted(() => ({ create: vi.fn(), authenticate: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), createStudioClient: mocks.create }));
const BASE = 'https://studio.example.test';
const ACTOR = '11111111-1111-1111-1111-111111111111';
const CHILD = '22222222-2222-2222-2222-222222222222';
const pool = {} as Pool;
const handler = createStudioClientHandler({ publicBaseUrl: BASE, servicePool: pool,
  authenticate: mocks.authenticate, log: () => undefined });
function post(body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/studio/clients`, { method: 'POST',
    headers: { origin: BASE, cookie: `n6b_session=${'a'.repeat(43)}`, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function streamedPost(chunks: readonly string[], headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/studio/clients`, { method: 'POST',
    headers: { origin: BASE, cookie: `n6b_session=${'a'.repeat(43)}`, ...headers },
    body: new ReadableStream<Uint8Array>({ start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    } }), duplex: 'half' } as RequestInit);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(ACTOR); mocks.create.mockResolvedValue({ accountId: CHILD });
});
describe('STU-01: authenticated same-origin child creation boundary', () => {
  it('SC-US-013-1: Next bodyless POST with an empty readable stream creates a client', async () => {
    for (const chunks of [[], [''], ['', '']] as const) {
      const request = streamedPost(chunks);
      expect(request.body).not.toBeNull(); expect(request.headers.get('content-type')).toBeNull();
      const response = await handler(request);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ data: { account_id: CHILD } });
      expect(mocks.create).toHaveBeenLastCalledWith(pool, ACTOR, null);
    }
  });
  it('empty streamed POST retains origin, session and studio authority checks', async () => {
    expect((await handler(streamedPost([], { origin: 'https://foreign.test' }))).status).toBe(403);
    expect((await handler(streamedPost([], { cookie: '' }))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockResolvedValue('forbidden');
    expect((await handler(streamedPost([]))).status).toBe(403);
  });
  it('nonempty streamed POST is bounded by actual bytes and still requires a JSON object', async () => {
    for (const chunks of [['{'], [' '], ['null'], ['[]'], ['"too-large"']]) {
      expect((await handler(streamedPost(chunks, { 'content-type': 'application/json' }))).status).toBe(422);
    }
    for (const contentType of ['', 'text/plain', 'application/jsonp']) {
      expect((await handler(streamedPost(['{}'], { 'content-type': contentType }))).status).toBe(422);
    }
    expect((await handler(streamedPost(['', 'x'.repeat(4096), 'x'], {
      'content-type': 'application/json', 'content-length': '0' }))).status).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((await handler(streamedPost(['', '{', '}'], { 'content-type': 'application/json; charset=utf-8' }))).status).toBe(201);
  });
  it('STU-01 origin guard refuses absent/foreign/null before authentication or creation', async () => {
    for (const origin of ['', 'null', 'https://foreign.test']) {
      expect((await handler(post({}, { origin }))).status).toBe(403);
    }
    const absent = post(); absent.headers.delete('origin');
    expect((await handler(absent)).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('missing/invalid/expired session refuses creation', async () => {
    for (const cookie of ['', 'n6b_session=child-uuid']) {
      expect((await handler(post({}, { cookie }))).status).toBe(401);
    }
    mocks.authenticate.mockResolvedValue(null);
    expect((await handler(post())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('STU-06 body authority/referral ignored; only validated cookie and authenticated actor passed', async () => {
    const response = await handler(post({ actorId: CHILD, account_id: CHILD, parent_account_id: CHILD,
      kind: 'studio', plan: 'studio', studio_access: false, ref: 'BodySpoof123', referred_by_bot_id: CHILD },
    { cookie: `n6b_session=${'a'.repeat(43)}; n6b_ref=External_123` }));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ data: { account_id: CHILD } });
    expect(mocks.create).toHaveBeenCalledWith(pool, ACTOR, 'External_123');
    expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('cache-control')).toBe('no-store');
    for (const ref of ['invalid', '../malformed', 'x'.repeat(13)]) {
      await handler(post({}, { cookie: `n6b_session=${'a'.repeat(43)}; n6b_ref=${ref}` }));
      expect(mocks.create).toHaveBeenLastCalledWith(pool, ACTOR, null);
    }
  });
  it('request bytes bounded and invalid envelopes rejected before DB', async () => {
    expect((await handler(post({ padding: 'x'.repeat(4096) }, { 'content-length': '1' }))).status).toBe(413);
    for (const body of [[], null, 'too-large']) expect((await handler(post(body))).status).toBe(422);
    expect((await handler(post({}, { 'content-type': 'text/plain' }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('SC-US-013-2/3: exact cap message, forbidden and safe failure', async () => {
    mocks.create.mockResolvedValue('cap');
    const cap = await handler(post()); expect(cap.status).toBe(409);
    expect((await cap.json()).error.message).toBe('предел 5 клиентов в MVP');
    mocks.create.mockResolvedValue('forbidden'); expect((await handler(post())).status).toBe(403);
    mocks.create.mockRejectedValue(new Error('secret'));
    const failed = await handler(post()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
  });
});
