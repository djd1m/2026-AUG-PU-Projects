import { afterAll, describe, expect, it } from 'vitest';
import { listCabinetBots, listCabinetSources, moscowDay, readCabinetContext, readDemoBot, withTenant } from '@n6b/db';
import { createStudioClientHandler } from '@/server/studio-handler';
import { createBotHandler } from '@/server/bots-handler';
import { createAskHandler } from '@/server/ask-handler';
import { createJobHandler, createRetryHandler, createSourceHandler } from '@/server/jobs-handler';
import { createPublishHandler } from '@/server/publish-handler';
import { ownerPool, runDate, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { AXIS, AnswerFixtureProvider, LIMITS } from './answer-fixture';
import { BASE, post, seedActor, studioAuth } from './studio-fixture';

const owner = ownerPool(); const tenant = tenantPool(); const service = servicePool();
const auth = studioAuth(service);
const deps = { tenantPool: tenant, servicePool: service, publicBaseUrl: BASE,
  authenticate: (token: string) => auth.authenticate(token), log: () => undefined,
  resolver: async () => [{ address: '93.184.216.34', family: 4 }] };
const createClient = createStudioClientHandler(deps);
const createBot = createBotHandler(deps);
const source = createSourceHandler(deps); const job = createJobHandler(deps); const retry = createRetryHandler(deps);
const publish = createPublishHandler(deps);
afterAll(async () => { await Promise.all([owner.end(), tenant.end(), service.end()]); });
async function child(token: string) {
  const response = await createClient(post(token)); expect(response.status).toBe(201);
  return (await response.json()).data.account_id as string;
}
function pdf(token: string) {
  const form = new FormData(); form.append('file', new Blob(['%PDF-1.7\n']), 'Client.pdf');
  return new Request(BASE, { method: 'POST', headers: { origin: BASE, cookie: `n6b_session=${token}` }, body: form });
}

describe('STU-03/04 child workflow under the studio session actor and real tenant RLS', () => {
  it('SC-US-013-1: selected child owns bot/site/PDF/jobs/documents/chunks/logs/model usage and sandbox quota', async () => {
    const studio = await seedActor(owner, service); const childId = await child(studio.token);
    await owner.query("UPDATE account SET plan = 'studio' WHERE id = $1", [studio.accountId]);
    const ownBot = await createBot(post(studio.token, { name: 'Own studio bot' })); expect(ownBot.status).toBe(201);
    const created = await createBot(post(studio.token, { name: 'Client bot', account_id: childId,
      actorId: childId, parent_account_id: childId, site_url: 'https://client.example.test/' }));
    expect(created.status).toBe(202); const { bot_id: botId, job_id: jobId, public_id: publicId } = (await created.json()).data;
    const context = await readCabinetContext(tenant, studio.accountId, childId);
    expect(context?.actor.id).toBe(studio.accountId); expect(context?.selected.id).toBe(childId);
    expect(context?.clients.map((account) => account.id)).toContain(childId);
    expect((await listCabinetBots(tenant, studio.accountId, childId)).map((bot) => bot.id)).toEqual([botId]);
    expect((await readCabinetContext(tenant, studio.accountId))?.selected.id).toBe(studio.accountId);
    expect((await listCabinetBots(tenant, studio.accountId, studio.accountId)).map((bot) => bot.id))
      .toEqual([(await ownBot.json()).data.bot_id]);
    const added = await source(post(studio.token, { url: 'https://client.example.test/extra', account_id: studio.accountId }), botId);
    expect(added.status).toBe(202);
    const uploaded = await source(pdf(studio.token), botId); expect(uploaded.status).toBe(202);
    expect((await job(new Request(BASE, { headers: { cookie: `n6b_session=${studio.token}` } }), jobId)).status).toBe(200);
    expect((await listCabinetSources(tenant, studio.accountId, childId)).filter((row) => row.source_id)).toHaveLength(3);
    const owned = (await owner.query(`SELECT b.account_id AS bot_owner, s.account_id AS source_owner,
      j.account_id AS job_owner, f.account_id AS file_owner FROM bot b JOIN source s ON s.bot_id = b.id
      JOIN index_job j ON j.source_id = s.id LEFT JOIN source_file f ON f.source_id = s.id WHERE b.id = $1`, [botId])).rows;
    expect(owned).toHaveLength(3);
    for (const row of owned) expect(row).toMatchObject({ bot_owner: childId, source_owner: childId, job_owner: childId });
    expect(owned.find((row) => row.file_owner)?.file_owner).toBe(childId);
    expect((await source(pdf(studio.token), botId)).status).toBe(202);
    expect((await source(pdf(studio.token), botId)).status).toBe(202);
    expect((await source(pdf(studio.token), botId)).status).toBe(409); // Free child cap, despite paid studio plan.

    const indexed = await withTenant(tenant, studio.accountId, async (c) => {
      const src = (await c.query<{ id: string }>('SELECT source_id AS id FROM index_job WHERE id = $1', [jobId])).rows[0]!;
      const document = (await c.query<{ id: string }>(`INSERT INTO document
        (source_id, account_id, locator_url, title, text, content_sha256)
        VALUES ($1, $2, 'https://client.example.test/info', 'Client', 'Доставка 2 дня', 'studio') RETURNING id`, [src.id, childId])).rows[0]!;
      const chunk = (await c.query<{ id: string }>(`INSERT INTO chunk
        (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
        VALUES ($1, $2, $3, 0, 'Доставка 2 дня', 'studio', 5, $4) RETURNING id`,
      [document.id, botId, childId, JSON.stringify(AXIS)])).rows[0]!;
      return { documentId: document.id, chunkId: chunk.id };
    });
    const provider = new AnswerFixtureProvider({ answer: { answer: 'Доставка 2 дня', unknown: false, cited_ids: [indexed.chunkId] } });
    const now = runDate(1);
    const ask = createAskHandler({ ...deps, minSimilarity: 0.7, now: () => now,
      gateway: constructGateway({ pool: service, provider, limits: LIMITS, now: () => now }) });
    const answer = await ask(post(studio.token, { question: 'Доставка?', accountId: studio.accountId }), botId);
    expect(answer.status).toBe(200); expect((await answer.json()).data.outcome).toBe('answered');
    for (const table of ['document', 'chunk', 'question_log', 'model_call_log']) {
      const rows = (await owner.query(`SELECT account_id FROM ${table} WHERE ${table === 'document' ? 'id' : 'bot_id'} = $1`,
        [table === 'document' ? indexed.documentId : botId])).rows;
      expect(rows.length).toBeGreaterThan(0); expect(rows.every((row) => row.account_id === childId)).toBe(true);
    }
    expect((await owner.query('SELECT used FROM quota_counter WHERE scope = $1 AND day = $2',
      [`answer:sandbox:${childId}`, moscowDay(now)])).rows[0].used).toBe(1);
    expect((await owner.query('SELECT used FROM quota_counter WHERE scope = $1 AND day = $2',
      [`answer:sandbox:${studio.accountId}`, moscowDay(now)])).rows).toEqual([]);
    const publication = await publish(post(studio.token, { contact: 'client@example.test', allowed_origins: ['https://client.example.test'],
      demo_enabled: true, account_id: studio.accountId }), botId);
    expect(publication.status).toBe(200); const data = (await publication.json()).data;
    expect(data.public_id).toBe(publicId); expect(data.embed_code).toContain(publicId);
    expect((await readDemoBot(service, data.demo_slug))?.accountId).toBe(childId);
    // Quota is the child's: exhaustion stops the existing provider path before a second call.
    await owner.query('UPDATE quota_counter SET used = 100 WHERE scope = $1 AND day = $2',
      [`answer:sandbox:${childId}`, moscowDay(now)]);
    const calls = provider.total;
    expect((await ask(post(studio.token, { question: 'Ещё?' }), botId)).status).toBe(429);
    expect(provider.total).toBe(calls);
    expect(await auth.authenticate(studio.token)).toBe(studio.accountId);
  });

  it('STU-04: PDF-only child creation has no site, then upload uses the actual child owner', async () => {
    const studio = await seedActor(owner, service); const childId = await child(studio.token);
    const response = await createBot(post(studio.token, { name: 'PDF only', account_id: childId }));
    expect(response.status).toBe(201); const botId = (await response.json()).data.bot_id;
    expect((await owner.query('SELECT id FROM source WHERE bot_id = $1', [botId])).rows).toEqual([]);
    const uploaded = await source(pdf(studio.token), botId); expect(uploaded.status).toBe(202);
    const jobId = (await uploaded.json()).data.job_id;
    const rows = (await owner.query(`SELECT b.account_id AS bot_owner, s.account_id AS source_owner,
      f.account_id AS file_owner, j.account_id AS job_owner FROM bot b JOIN source s ON s.bot_id = b.id
      JOIN source_file f ON f.source_id = s.id JOIN index_job j ON j.source_id = s.id
      WHERE b.id = $1 AND j.id = $2`, [botId, jobId])).rows;
    expect(rows).toEqual([{ bot_owner: childId, source_owner: childId, file_owner: childId, job_owner: childId }]);
  });

  it('STU-05: foreign/revoked/detached targets and direct UUID operations close on every request', async () => {
    const studio = await seedActor(owner, service); const other = await seedActor(owner, service);
    const ordinary = await seedActor(owner, service, 'owner');
    const sibling = await seedActor(owner, service, 'owner', studio.accountId);
    const childId = await child(studio.token);
    const created = await createBot(post(studio.token, { name: 'Revoke me', account_id: childId, site_url: 'https://client.example.test/' }));
    expect(created.status).toBe(202); const { bot_id: botId, job_id: jobId } = (await created.json()).data;
    const provider = new AnswerFixtureProvider();
    const now = runDate(2);
    const ask = createAskHandler({ ...deps, minSimilarity: 0.7,
      gateway: constructGateway({ pool: service, provider, limits: LIMITS, now: () => now }) });
    async function denied(actor: { token: string; accountId: string }) {
      expect(await readCabinetContext(tenant, actor.accountId, childId)).toBeNull();
      expect(await listCabinetBots(tenant, actor.accountId, childId)).toEqual([]);
      expect(await listCabinetSources(tenant, actor.accountId, childId)).toEqual([]);
      expect((await createBot(post(actor.token, { name: 'Spoof target', account_id: childId }))).status).toBe(404);
      expect((await source(post(actor.token, { url: 'https://client.example.test/extra' }), botId)).status).toBe(404);
      expect((await source(pdf(actor.token), botId)).status).toBe(404);
      expect((await job(new Request(BASE, { headers: { cookie: `n6b_session=${actor.token}` } }), jobId)).status).toBe(404);
      expect((await retry(post(actor.token), jobId)).status).toBe(404);
      expect((await publish(post(actor.token, { contact: 'x@example.test', allowed_origins: [], account_id: childId }), botId)).status).toBe(404);
      expect((await ask(post(actor.token, { question: 'By UUID', account_id: childId }), botId)).status).toBe(404);
    }
    for (const actor of [other, ordinary, sibling]) await denied(actor);
    expect(await readCabinetContext(tenant, sibling.accountId, studio.accountId)).toBeNull();
    expect((await createBot(post(studio.token, { name: 'Bad selector', account_id: 'not-uuid' }))).status).toBe(404);
    expect((await readCabinetContext(tenant, studio.accountId, childId))?.selected.id).toBe(childId);
    await owner.query('UPDATE account SET studio_access = false WHERE id = $1', [childId]);
    await denied(studio);
    await owner.query('UPDATE account SET studio_access = true, parent_account_id = NULL WHERE id = $1', [childId]);
    await denied(studio);
    expect(provider.total).toBe(0);
    expect((await owner.query('SELECT id FROM question_log WHERE bot_id = $1', [botId])).rows).toEqual([]);
    expect((await owner.query('SELECT id FROM model_call_log WHERE bot_id = $1', [botId])).rows).toEqual([]);
  });
});
