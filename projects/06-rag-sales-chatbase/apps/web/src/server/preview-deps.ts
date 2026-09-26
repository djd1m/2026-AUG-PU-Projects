// Боевая связка предпросмотра: SQL из @n6/db, ядро ответа из @n6/rag, CheckAddress, очередь. Одна функция для
// маршрутов и для тестов (tests/preview-flow.integration.test.ts): тест подменяет только сеть (DNS, шлюз модели),
// транспорт очереди и ограничитель двери — квота, изоляция и история идут по НАСТОЯЩЕМУ коду.
import { randomBytes } from 'node:crypto';
import { AddressRefused, checkAddress, systemResolver, type Resolver } from '@n6/rag/check-address';
import { answerQuestion, type Ceilings, type OpenRouter, type SpendRecorder } from '@n6/rag';
import { appendPreviewTurn, chargeAnswerQuota, claimPreview, createPreview, findPreviewRepeat, isUniqueViolation, loadAnswerBot, previewAnswersUsed,
  readIndexJob, readPreviewAccess, readPreviewSite, recordQuestion, recordShareCtaShown, searchChunks, type Pool } from '@n6/db';
import { AddressRefusal, type PreviewDependencies } from './preview-handler';

export interface PreviewWiring {
  pool: Pool;
  ceilings: Ceilings;
  secret: string;
  publicOrigin: string;
  budget: { pageBudget: number; embedBudget: number };
  client: Pick<OpenRouter, 'complete' | 'embed'>;
  models: { answerModel: string; embedModel: string };
  spend: SpendRecorder;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  enqueue: (message: { index_job_id: string; generation: number }) => Promise<void>;
  resolver?: Resolver;
  answerTimeoutMs?: number;
  log?: (line: string) => void;
}

export function createPreviewDependencies(w: PreviewWiring): PreviewDependencies {
  const { pool, ceilings } = w;
  const answersLimit = ceilings['preview_session:answers'];
  if (answersLimit === undefined || !Number.isSafeInteger(answersLimit) || answersLimit <= 0) {
    throw new Error('Предел preview_session:answers не загружен: ответы предпросмотра не выполняются');
  }
  return {
    publicOrigin: w.publicOrigin, secret: w.secret, budget: w.budget, allowMutation: w.allowMutation, log: w.log,
    checkAddress: async (url) => {
      try { return await checkAddress(url, w.resolver ?? systemResolver); }
      catch (error) { if (error instanceof AddressRefused) throw new AddressRefusal(error.reason); throw error; }
    },
    findRepeat: (session, key, hash) => findPreviewRepeat(pool, session, key, hash),
    createPreview: (input) => createPreview(pool, ceilings, input),
    isUniqueViolation,
    enqueue: w.enqueue,
    newPublicKey: () => randomBytes(16).toString('base64url'),
    readAccess: (hash, id) => readPreviewAccess(pool, hash, id),
    readJob: (id, botId) => readIndexJob(pool, id, { previewBotId: botId }),
    readSite: (botId) => readPreviewSite(pool, botId),
    answersLeft: async (session) => Math.max(0, answersLimit - await previewAnswersUsed(pool, session)),
    answer: async (botId, browserSession, request) => {
      const bot = await loadAnswerBot(pool, botId);
      if (!bot) return { status: 'not_found' };
      return answerQuestion({
        client: w.client, models: w.models, spend: w.spend, answerTimeoutMs: w.answerTimeoutMs,
        // Квота предпросмотра: 2 scope (:answers сессии ИЗ СТРОКИ предпросмотра + общий preview_answers), не 5.
        chargeQuota: () => chargeAnswerQuota(pool, ceilings, { mode: 'preview', browserSession }),
        search: (id, embedding) => searchChunks(pool, id, embedding),
        logQuestion: (entry) => recordQuestion(pool, { ...entry, visitorSessionId: null }),
      }, bot, 'preview', request);
    },
    appendTurn: (previewId, turn) => appendPreviewTurn(pool, previewId, turn),
    shareCtaShown: (botId) => recordShareCtaShown(pool, botId),
    authenticate: w.authenticate,
    claim: (input) => claimPreview(pool, input),
  };
}
