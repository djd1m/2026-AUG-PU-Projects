import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaRefused, type Pool } from '@n6b/db';
import { answerQuestion, dontKnow, type AnswerDeps, type AnswerInput } from '../../src/answer';
import { ModelDeadlineExceeded, ModelSchemaViolationError, ProviderUnavailableError } from '../../src/provider/port';
import type { PaidGateway } from '../../src/paid-call';

const mocks = vi.hoisted(() => ({ search: vi.fn(), documents: vi.fn(), log: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(),
  readCitationDocuments: mocks.documents, recordAnswerAttempt: mocks.log }));
vi.mock('../../src/search', async (original) => ({ ...await original<object>(), searchChunks: mocks.search }));
const BOT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';
const ID = '33333333-3333-3333-3333-333333333333';
const LOW = '44444444-4444-4444-4444-444444444444';
const embed = vi.fn(); const generate = vi.fn(); const begin = vi.fn();
const deps: AnswerDeps = { servicePool: {} as Pool, gateway: { beginAnswer: begin } as unknown as PaidGateway,
  minSimilarity: 0.7, now: () => new Date('2026-10-02T12:00:00Z') };
const input: AnswerInput = { bot: { id: BOT, accountId: ACCOUNT, contact: null }, question: 'Доставка?',
  channel: { kind: 'sandbox', accountId: ACCOUNT }, logChannel: 'sandbox' };
beforeEach(() => {
  vi.clearAllMocks();
  begin.mockResolvedValue({ embedQuestion: embed, generate }); embed.mockResolvedValue([1]);
  generate.mockResolvedValue({ answer: 'Доставка 2 дня https://evil.test', cited_ids: [ID], unknown: false });
  mocks.search.mockResolvedValue([{ id: ID, documentId: 'doc', text: 'Доставка 2 дня', sim: 0.8 },
    { id: LOW, documentId: 'lowdoc', text: 'Чужая тема', sim: 0.6 }]);
  mocks.documents.mockResolvedValue([{ chunk_id: ID, title: 'Доставка', locator_url: 'https://own.test/delivery', kind: 'site' }]);
  mocks.log.mockResolvedValue(true);
});

describe('Answer question orchestration through the existing gateway', () => {
  it('reserve → embed → top5 retrieval → generate → DB citations → single terminal log', async () => {
    const response = await answerQuestion(deps, input);
    expect(begin).toHaveBeenCalledWith(input.channel, { accountId: ACCOUNT, botId: BOT });
    expect(embed).toHaveBeenCalledWith(input.question); expect(mocks.search).toHaveBeenCalledWith(deps.servicePool, BOT, [1]);
    const fragments = JSON.parse(generate.mock.calls[0]![0][1].content).fragments;
    expect(fragments).toEqual([{ id: ID, text: 'Доставка 2 дня' }]);
    expect(begin.mock.invocationCallOrder[0]).toBeLessThan(embed.mock.invocationCallOrder[0]!);
    expect(embed.mock.invocationCallOrder[0]).toBeLessThan(mocks.search.mock.invocationCallOrder[0]!);
    expect(mocks.search.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]!);
    expect(generate.mock.invocationCallOrder[0]).toBeLessThan(mocks.documents.mock.invocationCallOrder[0]!);
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith(deps.servicePool, expect.objectContaining({ outcome: 'answered', citedIds: [ID], channel: 'sandbox' }));
    expect(response).toMatchObject({ status: 200, data: { answer_text: 'Доставка 2 дня', outcome: 'answered', show_cta: true,
      citations: [{ url: 'https://own.test/delivery' }] } });
  });
  it('the configured threshold controls generation; all hits below it refuse before generate', async () => {
    const response = await answerQuestion({ ...deps, minSimilarity: 0.9 }, input);
    expect(generate).not.toHaveBeenCalled(); expect(mocks.documents).not.toHaveBeenCalled();
    expect(response).toMatchObject({ status: 200, data: { answer_text: dontKnow(null), citations: [], outcome: 'below_threshold' } });
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith(deps.servicePool, expect.objectContaining({ outcome: 'below_threshold', citedIds: [] }));
  });
  it.each([{ unknown: true, cited_ids: [ID], reason: 'model_unknown' }, { unknown: false, cited_ids: [], reason: 'model_unknown' },
    { unknown: false, cited_ids: [LOW], reason: 'invalid_citation' }, { unknown: false, cited_ids: ['foreign'], reason: 'invalid_citation' }])(
    'invalid output %j never reaches DB citation resolution', async ({ reason, ...payload }) => {
      generate.mockResolvedValue({ answer: 'Invented', ...payload }); mocks.log.mockResolvedValue(false);
      const response = await answerQuestion(deps, input);
      expect(mocks.documents).not.toHaveBeenCalled();
      expect(response).toMatchObject({ status: 200, data: { answer_text: dontKnow(null), citations: [], outcome: reason, show_cta: false } });
      expect(mocks.log).toHaveBeenCalledTimes(1);
    });
  it('partial DB citation resolution refuses the whole answer; no invented link or CTA', async () => {
    mocks.documents.mockResolvedValue([]); mocks.log.mockResolvedValue(false);
    expect(await answerQuestion(deps, input)).toMatchObject({ status: 200, data: { outcome: 'invalid_citation', citations: [], show_cta: false } });
    expect(mocks.log).toHaveBeenCalledWith(deps.servicePool, expect.objectContaining({ outcome: 'invalid_citation', citedIds: [] }));
  });
  it('quota refuses before embedding, uses Retry-After and logs once', async () => {
    begin.mockRejectedValue(new QuotaRefused(`answer:sandbox:${ACCOUNT}`)); mocks.log.mockResolvedValue(false);
    expect(await answerQuestion(deps, input)).toMatchObject({ status: 429, error: { code: 'limit_sandbox_account', retryAfterSeconds: 32400 } });
    expect(embed).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith(deps.servicePool, expect.objectContaining({ outcome: 'limited' }));
  });
  it.each([new ModelDeadlineExceeded(), new ModelSchemaViolationError('secret'), new ProviderUnavailableError('secret')])(
    'provider failure %s safely logs once without retry', async (error) => {
      generate.mockRejectedValue(error); mocks.log.mockResolvedValue(false);
      expect(await answerQuestion(deps, input)).toMatchObject({ status: 503,
        error: { code: 'provider_unavailable', message: 'Сервис ответа временно недоступен' } });
      expect(begin).toHaveBeenCalledTimes(1); expect(embed).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledWith(deps.servicePool, expect.objectContaining({ outcome: 'error', citedIds: [] }));
    });
  it('failed terminal persistence propagates, without a second log or success', async () => {
    mocks.log.mockRejectedValue(new Error('event insert failed'));
    await expect(answerQuestion(deps, input)).rejects.toThrow('event insert failed');
    expect(mocks.log).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(1);
  });
});
