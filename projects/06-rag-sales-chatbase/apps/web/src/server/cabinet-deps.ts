// Боевая связка кабинета бота: SQL из @n6/db, ядро ответа из @n6/rag, CheckAddress, очередь. Одна функция для маршрутов
// и для тестов (tests/bot-cabinet.integration.test.ts): тест подменяет только сеть (DNS, шлюз модели), транспорт
// очереди и ограничитель двери — владение, пределы плана, квота и задача идут по НАСТОЯЩЕМУ коду.
import { randomBytes } from 'node:crypto';
import { AddressRefused, checkAddress, systemResolver, type Resolver } from '@n6/rag/check-address';
import { answerQuestion, type Ceilings, type OpenRouter, type SpendRecorder } from '@n6/rag';
import { addAllowedOrigin, chargeAnswerQuota, createBot, createSiteSource, findJobByIdempotencyKey, listBots, loadOwnedAnswerBot, ownsBot, retrySource,
  searchChunks, setAnswersVerified, updateBotSettings, type Pool } from '@n6/db';
import type { CabinetDependencies } from './cabinet-handler';
import { AddressRefusal } from './preview-handler';

export interface CabinetWiring {
  pool: Pool;
  ceilings: Ceilings;
  publicOrigin: string;
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

export function createCabinetDependencies(w: CabinetWiring): CabinetDependencies {
  const { pool, ceilings } = w;
  return {
    publicOrigin: w.publicOrigin, authenticate: w.authenticate, allowMutation: w.allowMutation, enqueue: w.enqueue, log: w.log,
    listBots: (accountId) => listBots(pool, accountId),
    createBot: (input) => createBot(pool, input),
    newPublicKey: () => randomBytes(16).toString('base64url'),
    updateSettings: (botId, accountId, patch) => updateBotSettings(pool, botId, accountId, patch),
    addOrigin: (botId, accountId, origin) => addAllowedOrigin(pool, botId, accountId, origin),
    checkAddress: async (url) => {
      try { return await checkAddress(url, w.resolver ?? systemResolver); }
      catch (error) { if (error instanceof AddressRefused) throw new AddressRefusal(error.reason); throw error; }
    },
    ownsBot: (botId, accountId) => ownsBot(pool, botId, accountId),
    createSite: (input) => createSiteSource(pool, input),
    findJob: (botId, key) => findJobByIdempotencyKey(pool, botId, key),
    retry: (sourceId, accountId) => retrySource(pool, sourceId, accountId),
    setVerified: (botId, accountId, verified) => setAnswersVerified(pool, botId, accountId, verified),
    answer: async (botId, accountId, request) => {
      const bot = await loadOwnedAnswerBot(pool, botId, accountId);
      if (!bot) return { status: 'not_found' };
      return answerQuestion({
        client: w.client, models: w.models, spend: w.spend, answerTimeoutMs: w.answerTimeoutMs,
        // Квота владельца (A-N6-033): суточный и месячный предел бота по плану + общий суточный — ДО эмбеддинга.
        chargeQuota: () => chargeAnswerQuota(pool, ceilings, { mode: 'owner', botId: bot.id, plan: bot.plan }),
        search: (id, embedding) => searchChunks(pool, id, embedding),
        // Вопросы владельца — не вопросы посетителей: в question_log (сводка «ответил / не знал», 152-ФЗ) не пишутся.
        logQuestion: async () => {},
      }, bot, 'owner', request);
    },
  };
}
