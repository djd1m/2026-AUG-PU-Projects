import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PublicationBot } from '@n6b/db';
import { createPublishHandler, publicationEmbedCode } from '@/server/publish-handler';

const mocks = vi.hoisted(() => ({ publish: vi.fn(), authenticate: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), publishBot: mocks.publish }));
const BOT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://cabinet.test';
const stored: PublicationBot = { id: BOT, public_id: 'immutable_12', contact: 'owner@example.test',
  allowed_origins: [], published: true, demo_enabled: false };
const payload = { contact: 'owner@example.test', allowed_origins: [] };
const handler = createPublishHandler({ publicBaseUrl: BASE, authenticate: mocks.authenticate,
  tenantPool: {} as Pool, log: () => undefined });
function patch(raw: string = JSON.stringify(payload), extra: Record<string, string> = {}) {
  return new Request(`${BASE}/api/bots/${BOT}/publish`, { method: 'PATCH', body: raw,
    headers: { origin: BASE, cookie: `n6b_session=${'a'.repeat(43)}`, 'content-type': 'application/json', ...extra } });
}
beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(ACCOUNT); mocks.publish.mockResolvedValue(stored); });

describe('PUB-01 publication gates', () => {
  it.each(['', 'null', 'https://foreign.test'])('rejects origin %s before session and DB', async (origin) => {
    expect((await handler(patch(undefined, { origin }), BOT)).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('rejects missing origin, expired/missing/malformed session and invalid UUID', async () => {
    const noOrigin = patch(); noOrigin.headers.delete('origin');
    expect((await handler(noOrigin, BOT)).status).toBe(403);
    for (const cookie of ['', 'n6b_session=bad']) expect((await handler(patch(undefined, { cookie }), BOT)).status).toBe(401);
    mocks.authenticate.mockResolvedValue(null);
    expect((await handler(patch(), BOT)).status).toBe(401);
    mocks.authenticate.mockResolvedValue(ACCOUNT);
    expect((await handler(patch(), 'not-a-uuid')).status).toBe(404);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each(['{bad', 'null', '[]', '"text"', '"too-large"', '"invalid"', '{}'])('rejects malformed payload %s before DB', async (raw) => {
    expect((await handler(patch(raw), BOT)).status).toBe(422); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('checks actual stream bytes despite false Content-Length and requires JSON', async () => {
    expect((await handler(patch(JSON.stringify({ ...payload, padding: 'x'.repeat(4096) }), { 'content-length': '1' }), BOT)).status).toBe(413);
    expect((await handler(patch(undefined, { 'content-type': 'text/plain' }), BOT)).status).toBe(422);
    expect((await handler(patch(undefined, { 'content-type': 'application/json-wrong' }), BOT)).status).toBe(422);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each([null, 'https://example.test', ['*'], Array(21).fill('http://x.test')])('rejects origins %j without update', async (allowed_origins) => {
    expect((await handler(patch(JSON.stringify({ ...payload, allowed_origins })), BOT)).status).toBe(422);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each([null, 1, 'true', {}])('rejects non-boolean demo flag %j', async (demo_enabled) => {
    expect((await handler(patch(JSON.stringify({ ...payload, demo_enabled })), BOT)).status).toBe(422);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('foreign/nonexistent bot gives identical 404, unavailable DB gives safe 503', async () => {
    mocks.publish.mockResolvedValue(null);
    const response = await handler(patch(), BOT);
    expect(response.status).toBe(404); expect(await response.text()).not.toContain('embed_code');
    mocks.publish.mockRejectedValue(new Error('secret connection string'));
    const failed = await handler(patch(), BOT);
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
  });
  it('server selects account/public_id and normalizes the complete payload with optional boolean', async () => {
    const response = await handler(patch(JSON.stringify({ contact: ' owner@example.test ',
      allowed_origins: ['https://EXAMPLE.test:443/a', 'https://example.test', 'http://example.test:8080'],
      demo_enabled: true, account_id: 'foreign', public_id: 'replacement' })), BOT);
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), ACCOUNT, BOT, { contact: payload.contact,
      allowed_origins: ['https://example.test', 'http://example.test:8080'], demo_enabled: true });
    const body = await response.json();
    expect(body.data.public_id).toBe(stored.public_id);
    expect(body.data.embed_code).toBe(`<script src="${BASE}/w.js" data-bot="immutable_12" async></script>`);
    expect(body.data).not.toHaveProperty('demo_url');
  });
  it('empty list stays closed and omitted demo flag stays omitted', async () => {
    expect((await handler(patch(), BOT)).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), ACCOUNT, BOT, payload);
  });
});

describe('PUB-06 / SC-US-007-1 embed code', () => {
  it('requires publication and valid contact; uses configured base and immutable id', () => {
    expect(publicationEmbedCode({ ...stored, published: false }, BASE)).toBeNull();
    for (const contact of [null, '', 'invalid']) expect(publicationEmbedCode({ ...stored, contact }, BASE)).toBeNull();
    expect(publicationEmbedCode(stored, 'https://configured.test:444/prefix/')).toBe(
      '<script src="https://configured.test:444/w.js" data-bot="immutable_12" async></script>');
  });
});
