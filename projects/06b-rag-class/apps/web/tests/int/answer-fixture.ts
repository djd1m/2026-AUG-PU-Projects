// Test-only binding: real API handler + real PaidGateway + real Postgres, no production fake selector.
import { randomBytes } from 'node:crypto';
import type { Pool } from '@n6b/db';
import { createAskHandler } from '@/server/ask-handler';
import { FakeProvider, type FakeOptions } from '../../../../packages/rag/src/provider/fake';
import type { EmbedResult } from '../../../../packages/rag/src/provider/port';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { seedBot } from '../../../../services/worker/tests/int/helpers';
import { runDate } from '../../../../packages/db/tests/int/helpers';

export const BASE = 'https://sandbox.example.test';
export const QUESTION = 'Когда доставка?';
export const AXIS = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
export const LIMITS = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000,
  sandboxAccountDay: 100, sandboxGlobalDay: 2000, embedTokensAccountDay: 100000, embedTokensGlobalDay: 2000000 };
let daySequence = 0;
export class AnswerFixtureProvider extends FakeProvider {
  override async embed(texts: readonly string[], signal: AbortSignal): Promise<EmbedResult> {
    const result = await super.embed(texts, signal);
    return { ...result, vectors: texts.map(() => AXIS) };
  }
}
export function request(token: string, body: unknown = { question: QUESTION }, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/bots/fixture/ask`, { method: 'POST', body: JSON.stringify(body),
    headers: { origin: BASE, cookie: `n6b_session=${token}`, 'content-type': 'application/json', ...headers } });
}

export async function seedAnswerFixture(owner: Pool, cabinet: Pool, service: Pool,
  options: FakeOptions & { threshold?: number; contact?: string | null; accountId?: string } = {}) {
  const bot = options.accountId ? { accountId: options.accountId,
    botId: (await owner.query<{ id: string }>(
      "INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'fixture') RETURNING id",
      [options.accountId, randomBytes(9).toString('base64url')])).rows[0]!.id } : await seedBot(owner);
  const source = (await owner.query<{ id: string }>(`INSERT INTO source (bot_id, account_id, kind, url)
    VALUES ($1, $2, 'site', 'https://own.example.test') RETURNING id`, [bot.botId, bot.accountId])).rows[0]!;
  const document = (await owner.query<{ id: string }>(`INSERT INTO document
    (source_id, account_id, locator_url, title, text, content_sha256)
    VALUES ($1, $2, 'https://own.example.test/delivery', '<script>Доставка</script>', 'Доставка 2 дня', 'fixture') RETURNING id`,
  [source.id, bot.accountId])).rows[0]!;
  const chunk = (await owner.query<{ id: string }>(`INSERT INTO chunk
    (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
    VALUES ($1, $2, $3, 0, 'Доставка 2 дня', 'fixture', 5, $4) RETURNING id`,
  [document.id, bot.botId, bot.accountId, JSON.stringify(AXIS)])).rows[0]!;
  await owner.query('UPDATE bot SET contact = $2 WHERE id = $1', [bot.botId, options.contact ?? null]);
  const provider = new AnswerFixtureProvider({ ...options, answer: options.answer ?? {
    answer: 'Доставка 2 дня. https://model-evil.test <script>text</script>', cited_ids: [chunk.id], unknown: false,
  } });
  const now = runDate(++daySequence);
  const gateway = constructGateway({ pool: service, provider, limits: LIMITS, now: () => now });
  const token = randomBytes(32).toString('base64url');
  const handler = createAskHandler({ publicBaseUrl: BASE, tenantPool: cabinet, servicePool: service,
    gateway, minSimilarity: options.threshold ?? 0.7, now: () => now,
    authenticate: async (value) => value === token ? bot.accountId : null, log: () => undefined });
  return { ...bot, sourceId: source.id, documentId: document.id, chunkId: chunk.id, provider, gateway, token, handler, now };
}
