// Боевая связка POST /w/v1/ask: SQL из @n6/db, ядро ответа из @n6/rag. Одна функция для маршрута и для тестов
// (tests/visitor-ask.integration.test.ts, браузерная оснастка): тест подменяет только сеть (шлюз модели) и ограничитель
// двери — квота 5 scope, сессия, история, установка и журнал вопросов идут по НАСТОЯЩЕМУ коду.
import { answerQuestion, type Ceilings, type OpenRouter, type SpendRecorder } from '@n6/rag';
import { appendVisitorTurn, chargeAnswerQuota, openVisitorSession, recordFirstAnswer, recordQuestion, searchChunks, type Pool } from '@n6/db';
import type { WidgetAskDependencies } from './widget-ask-handler';
import { createWidgetDependencies } from './widget-deps';

export interface WidgetAskWiring {
  pool: Pool;
  ceilings: Ceilings;
  publicOrigin: string;
  secret: string;
  client: Pick<OpenRouter, 'complete' | 'embed'>;
  models: { answerModel: string; embedModel: string };
  spend: SpendRecorder;
  allowMutation: (ip: string) => Promise<boolean>;
  answerTimeoutMs?: number;
  log?: (line: string) => void;
}

export function createWidgetAskDependencies(w: WidgetAskWiring): WidgetAskDependencies {
  const { pool, ceilings } = w;
  return {
    ...createWidgetDependencies({ pool, publicOrigin: w.publicOrigin, secret: w.secret, allowMutation: w.allowMutation, log: w.log }),
    openSession: (input) => openVisitorSession(pool, input),
    answer: ({ bot, visitorSession, ipPrefix, request }) => answerQuestion({
      client: w.client, models: w.models, spend: w.spend, answerTimeoutMs: w.answerTimeoutMs,
      // FR-LIMIT-001: пять scope одной транзакцией ДО эмбеддинга; сутки и месяц — по часам БД (answers.ts).
      chargeQuota: () => chargeAnswerQuota(pool, ceilings, { mode: 'widget', botId: bot.row.botId, plan: bot.row.plan, visitorSession, ipPrefix }),
      search: (id, embedding) => searchChunks(pool, id, embedding),
      // 152-ФЗ: текст вопроса — только у unknown (14 дней), у answered — id цитат; сессия — для сводки владельца.
      logQuestion: (entry) => recordQuestion(pool, { ...entry, visitorSessionId: visitorSession }),
    }, { id: bot.row.botId, status: bot.row.status, companyName: bot.row.companyName, contact: bot.contact }, 'widget', request),
    appendTurn: (sessionId, turn) => appendVisitorTurn(pool, sessionId, turn),
    recordFirstAnswer: (input) => recordFirstAnswer(pool, input),
    logRefusedOrigin: (botId) => recordQuestion(pool, { botId, outcome: 'refused_origin', text: null, citedChunkIds: [], visitorSessionId: null }),
  };
}
