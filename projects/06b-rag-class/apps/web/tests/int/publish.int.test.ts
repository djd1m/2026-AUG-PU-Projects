import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { listCabinetBots, type PublicationBot, withTenant } from '@n6b/db';
import { AuthService } from '@/server/auth';
import { PgAuthStore } from '@/server/auth-store';
import { createPublishHandler, type PublicationData, publicationEmbedCode } from '@/server/publish-handler';
import { publicationOrigins } from '@/server/origin';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';

// Real session lookup, tenant role/RLS and PostgreSQL writes. No provider, crawl or outgoing contact/origin request.
const BASE = 'https://cabinet.test';
const owner = ownerPool();
const cabinet = tenantPool(10);
const service = servicePool(4);
const accounts: string[] = [];
const auth = new AuthService(new PgAuthStore(service), {
  hash: async () => { throw new Error('password hashing is outside publication'); },
  compare: async () => { throw new Error('password checking is outside publication'); },
}, 'publication-fixture-secret');
const handler = createPublishHandler({ tenantPool: cabinet, publicBaseUrl: BASE,
  authenticate: (token) => auth.authenticate(token) });

afterAll(async () => {
  try {
    await owner.query('DELETE FROM source WHERE account_id = ANY($1::uuid[])', [accounts]);
    await owner.query('DELETE FROM bot WHERE account_id = ANY($1::uuid[])', [accounts]);
    await owner.query('DELETE FROM session WHERE account_id = ANY($1::uuid[])', [accounts]);
    await owner.query('DELETE FROM account WHERE id = ANY($1::uuid[])', [accounts]);
  } finally { await Promise.all([owner.end(), cabinet.end(), service.end()]); }
});

async function fixture() {
  const accountId = (await owner.query<{ id: string }>(
    "INSERT INTO account (email, password_hash) VALUES ($1, 'x') RETURNING id",
    [`${randomBytes(8).toString('hex')}@publication.test`])).rows[0]!.id;
  accounts.push(accountId);
  const publicId = randomBytes(9).toString('base64url');
  const botId = (await owner.query<{ id: string }>(
    "INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'publish') RETURNING id", [accountId, publicId])).rows[0]!.id;
  const token = randomBytes(32).toString('base64url');
  await owner.query('INSERT INTO session (account_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
    [accountId, auth.tokenHash(token)]);
  return { accountId, publicId, botId, token };
}
function patch(token: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/bots/x/publish`, { method: 'PATCH',
    headers: { origin: BASE, cookie: `n6b_session=${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body) });
}
const row = async (id: string) => (await owner.query<PublicationBot>(
  'SELECT id, public_id, contact, allowed_origins, published, demo_enabled FROM bot WHERE id = $1', [id])).rows[0]!;
const data = async (res: Response) => (await res.json() as { data: PublicationData }).data;
const valid = { contact: 'owner@example.test', allowed_origins: ['https://example.test'] };

describe('PUB-01/02/05 real PostgreSQL publication', () => {
  it('SC-US-006-3: invalid-before-write preserves both unpublished and previously published state, no code', async () => {
    const a = await fixture();
    for (const published of [false, true]) {
      if (published) expect((await handler(patch(a.token, valid), a.botId)).status).toBe(200);
      const before = await row(a.botId);
      for (const body of [{ ...valid, contact: '' }, { ...valid, contact: 'http://contact.test' },
        { ...valid, allowed_origins: ['https://user:pass@example.test'] }, { ...valid, demo_enabled: 'true' }]) {
        const response = await handler(patch(a.token, body), a.botId);
        expect(response.status).toBe(422); expect(await response.text()).not.toContain('embed_code');
        expect(await row(a.botId)).toEqual(before);
      }
    }
  });
  it('owner session succeeds; foreign/nonexistent 404, expired/missing session 401 and wrong origin 403 do not mutate', async () => {
    const a = await fixture(); const b = await fixture();
    const before = await row(a.botId);
    for (const [request, id, status] of [
      [patch(b.token, valid), a.botId, 404], [patch(a.token, valid), randomUUID(), 404],
      [patch(a.token, valid, { cookie: '' }), a.botId, 401],
      [patch(a.token, valid, { origin: 'https://foreign.test' }), a.botId, 403],
      [patch(a.token, { ...valid, padding: 'x'.repeat(4096) }), a.botId, 413],
    ] as const) expect((await handler(request, id)).status).toBe(status);
    expect(await row(a.botId)).toEqual(before);
    await withTenant(cabinet, b.accountId, async (c) => {
      expect((await c.query('SELECT id FROM bot WHERE id = $1', [a.botId])).rows).toEqual([]);
      expect((await c.query('UPDATE bot SET published = true WHERE id = $1 RETURNING id', [a.botId])).rowCount).toBe(0);
    });
    await owner.query('UPDATE session SET expires_at = now() - interval \'1 second\' WHERE token_hash = $1', [auth.tokenHash(a.token)]);
    expect((await handler(patch(a.token, valid), a.botId)).status).toBe(401);
    expect(await row(a.botId)).toEqual(before);
  });
  it('SC-US-007-1/3: normalized settings and immutable code persist through cabinet reload; empty list never refilled', async () => {
    const a = await fixture();
    await owner.query("INSERT INTO source (account_id, bot_id, kind, url) VALUES ($1, $2, 'site', 'https://site.test/page')", [a.accountId, a.botId]);
    const before = (await listCabinetBots(cabinet, a.accountId))[0]!;
    expect(before.allowed_origins).toEqual([]); expect(publicationOrigins(before)).toEqual(['https://site.test']);
    expect(publicationEmbedCode(before, BASE)).toBeNull();
    const response = await handler(patch(a.token, { contact: ' +79991234567 ', allowed_origins: ['https://EXAMPLE.test:443/a',
      'https://example.test', 'http://example.test:8080'], demo_enabled: true, public_id: 'replaced', account_id: randomUUID() }), a.botId);
    expect(response.status).toBe(200);
    const saved = await data(response);
    expect(saved).toMatchObject({ public_id: a.publicId, contact: '+79991234567', published: true, demo_enabled: true,
      allowed_origins: ['https://example.test', 'http://example.test:8080'] });
    const reloaded = (await listCabinetBots(cabinet, a.accountId))[0]!;
    expect(reloaded).toMatchObject(await row(a.botId));
    expect(publicationEmbedCode(reloaded, BASE)).toBe(saved.embed_code);
    expect((await handler(patch(a.token, { ...valid, allowed_origins: [] }), a.botId)).status).toBe(200);
    const closed = (await listCabinetBots(cabinet, a.accountId))[0]!;
    expect(closed.allowed_origins).toEqual([]); expect(publicationOrigins(closed)).toEqual([]);
    expect(closed.demo_enabled).toBe(true); // Omission preserves the existing flag.
    expect((await handler(patch(a.token, { ...valid, allowed_origins: [], demo_enabled: false }), a.botId)).status).toBe(200);
    expect((await row(a.botId)).demo_enabled).toBe(false);
  });
  it('SC-US-007-2: first chronological site only proposed, PDF-only proposes nothing', async () => {
    const a = await fixture();
    await owner.query("INSERT INTO source (account_id, bot_id, kind, file_name) VALUES ($1, $2, 'pdf', 'manual.pdf')", [a.accountId, a.botId]);
    expect(publicationOrigins((await listCabinetBots(cabinet, a.accountId))[0]!)).toEqual([]);
    for (const [url, day] of [['https://first.test/path', '2000-01-01'], ['https://second.test', '2000-01-02']]) {
      await owner.query("INSERT INTO source (account_id, bot_id, kind, url, created_at) VALUES ($1, $2, 'site', $3, $4)",
        [a.accountId, a.botId, url, day]);
    }
    expect(publicationOrigins((await listCabinetBots(cabinet, a.accountId))[0]!)).toEqual(['https://first.test']);
    expect((await row(a.botId)).allowed_origins).toEqual([]);
    expect((await listCabinetBots(cabinet, randomUUID()))).toEqual([]);
  });
  it('PUB-05: competing different payloads stay whole; unrelated owner progresses while the first bot is locked', async () => {
    const a = await fixture(); const b = await fixture();
    // Warm all ten tenant connections before overlap; a real row lock queues writes to the same bot.
    await Promise.all(Array.from({ length: 10 }, () => cabinet.query('SELECT pg_sleep(0.02)')));
    const lock = await owner.connect();
    const payloads = Array.from({ length: 6 }, (_, i) => ({ contact: `owner${i}@example.test`,
      allowed_origins: [`https://site${i}.test`, `http://site${i}.test:8080`], demo_enabled: i % 2 === 0 }));
    let requests: Promise<Response>[] = [];
    try {
      await lock.query('BEGIN'); await lock.query('SELECT id FROM bot WHERE id = $1 FOR UPDATE', [a.botId]);
      requests = payloads.map((payload) => handler(patch(a.token, payload), a.botId));
      expect((await handler(patch(b.token, valid), b.botId)).status).toBe(200);
      await lock.query('SELECT pg_sleep(0.1)');
      await lock.query('COMMIT');
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(200));
    for (let i = 0; i < responses.length; i++) expect(await data(responses[i]!)).toMatchObject(payloads[i]!);
    const final = await row(a.botId);
    const completeStates = payloads.map((payload) => ({ id: a.botId, public_id: a.publicId, published: true, ...payload }));
    expect(completeStates).toContainEqual(final); // A mixed contact/origin/demo tuple cannot pass.
    expect(await listCabinetBots(cabinet, a.accountId)).toHaveLength(1);
  });
});
