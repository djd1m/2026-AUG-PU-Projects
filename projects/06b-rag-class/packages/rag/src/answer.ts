import { type AnswerBot, type Pool, QuotaRefused, readCitationDocuments, recordAnswerAttempt } from '@n6b/db';
import { citationRefusal, type Citation, resolveCitations, stripModelUrls } from './citations.js';
import type { AnswerChannel, PaidGateway } from './paid-call.js';
import { answerPrompt } from './prompt.js';
import { ModelCallFailed } from './provider/port.js';
import { type HttpRefusal, providerRefusal, quotaRefusal } from './refusal.js';
import { searchChunks } from './search.js';

export type AnswerOutcome = 'answered' | 'below_threshold' | 'model_unknown' | 'invalid_citation';
export interface AnswerData {
  readonly answer_text: string;
  readonly citations: readonly Citation[];
  readonly outcome: AnswerOutcome;
  readonly show_cta: boolean;
}
export type AnswerResponse = { readonly status: 200; readonly data: AnswerData }
  | { readonly status: 429 | 503; readonly error: HttpRefusal; readonly contact: string | null };
export interface AnswerDeps {
  readonly servicePool: Pool;
  readonly gateway: PaidGateway;
  readonly minSimilarity: number;
  readonly now?: () => Date;
}
export interface AnswerInput {
  readonly bot: AnswerBot;
  readonly question: string;
  readonly channel: AnswerChannel;
  readonly logChannel: 'sandbox' | 'widget' | 'demo';
  readonly visitorKey?: string;
  readonly originHost?: string;
}

export function dontKnow(contact: string | null): string {
  return contact ? `В материалах сайта нет ответа. Свяжитесь: ${contact}`
    : 'В материалах нет ответа. Посетители увидят здесь ваш контакт — укажите его перед публикацией';
}

/** The caller authenticates first. Every accepted attempt gets one terminal question log, outside provider awaits. */
export async function answerQuestion(deps: AnswerDeps, input: AnswerInput): Promise<AnswerResponse> {
  if (!input.question.trim() || input.question.length > 500) throw new Error('вопрос вне 1…500 символов');
  if (!Number.isFinite(deps.minSimilarity) || deps.minSimilarity < 0 || deps.minSimilarity > 1) {
    throw new Error('MIN_SIMILARITY вне 0…1');
  }
  const { bot, question } = input;
  let response: AnswerResponse;
  let outcome: AnswerOutcome | 'limited' | 'error';
  let citedIds: readonly string[] = [];
  try {
    const attempt = await deps.gateway.beginAnswer(input.channel, { accountId: bot.accountId, botId: bot.id });
    const vector = await attempt.embedQuestion(question);
    const good = (await searchChunks(deps.servicePool, bot.id, vector)).filter((h) => h.sim >= deps.minSimilarity);
    let text = dontKnow(bot.contact);
    let citations: Citation[] = [];
    outcome = 'below_threshold';
    if (good.length) {
      const out = await attempt.generate(answerPrompt(question, good));
      const refusal = citationRefusal(out, good);
      outcome = refusal ?? 'invalid_citation';
      if (!refusal) {
        const resolved = resolveCitations(out.cited_ids, await readCitationDocuments(deps.servicePool, bot, out.cited_ids));
        if (resolved?.length) {
          text = stripModelUrls(out.answer);
          if (text) { outcome = 'answered'; citations = resolved; citedIds = [...new Set(out.cited_ids)]; }
          else { outcome = 'model_unknown'; text = dontKnow(bot.contact); }
        }
      }
    }
    response = { status: 200, data: { answer_text: text, citations, outcome, show_cta: false } };
  } catch (error) {
    if (error instanceof QuotaRefused) {
      outcome = 'limited';
      const refusal = quotaRefusal(error.scope, bot.contact ?? '', deps.now?.());
      response = { status: 429, error: refusal, contact: bot.contact };
    } else {
      outcome = 'error';
      const refusal = error instanceof ModelCallFailed ? providerRefusal(error)
        : { status: 503 as const, code: 'answer_unavailable', message: 'Сервис ответа временно недоступен' };
      response = { status: 503, error: refusal, contact: bot.contact };
    }
  }
  // Persistence errors propagate. Never turn a rolled-back answered transaction into another log or successful CTA.
  const showCta = await recordAnswerAttempt(deps.servicePool, { ...input, outcome, citedIds, channel: input.logChannel });
  return response.status === 200 ? { ...response, data: { ...response.data, show_cta: showCta } } : response;
}
