// Ответ при исчерпании предела (01_plan.md §4). Отказ, не деградация: ни модели «подешевле», ни очереди.
// Посетителю виджета и демо — ОДИН текст на личный, ботовый и общий предел (OWN-06B-009): причина и числа чужих
// пределов не раскрываются, код ошибки тоже один. Песочнице (владелец, вошёл) — свой текст со сроком сброса.

import { ModelCallFailed } from './provider/port.js';

export interface HttpRefusal {
  readonly status: 429 | 503;
  readonly code: string;
  readonly message: string;
  /** Секунды до сброса (полночь по Москве); для 503 не задаётся. */
  readonly retryAfterSeconds?: number;
}

/** Секунд до ближайшей полуночи по Москве (UTC+3 без перехода на летнее время). */
export function secondsToMoscowMidnight(at: Date = new Date()): number {
  const MSK_OFFSET_MS = 3 * 3600 * 1000;
  const msk = at.getTime() + MSK_OFFSET_MS;
  const nextMidnight = (Math.floor(msk / 86_400_000) + 1) * 86_400_000;
  return Math.max(1, Math.ceil((nextMidnight - msk) / 1000));
}

export function visitorLimitText(contact: string): string {
  return `Лимит вопросов на сегодня исчерпан. Свяжитесь с владельцем сайта: ${contact}`;
}

/** 429 по отказавшему scope. Неизвестный scope — ошибка кода (fail-closed: исключение, а не «разрешить»). */
export function quotaRefusal(scope: string, contact: string, at: Date = new Date()): HttpRefusal {
  const retryAfterSeconds = secondsToMoscowMidnight(at);
  if (/^answer:(visitor:|bot:|global$)/.test(scope)) {
    return { status: 429, code: 'limit_reached', message: visitorLimitText(contact), retryAfterSeconds };
  }
  if (scope === 'answer:sandbox:global') {
    return { status: 429, code: 'limit_sandbox_global', retryAfterSeconds,
      message: 'Песочница сервиса перегружена на сегодня, сброс в 00:00 МСК' };
  }
  if (scope.startsWith('answer:sandbox:')) {
    return { status: 429, code: 'limit_sandbox_account', retryAfterSeconds,
      message: 'Лимит песочницы на сегодня исчерпан, сброс в 00:00 МСК' };
  }
  throw new Error('отказ по пределу вне ответов: у этого канала нет HTTP-ответа 429');
}

/** 503 на отказ провайдера (таймаут, 5xx, `error` в 200, схема): попытка засчитана, перехода к другому исполнителю нет. */
export function providerRefusal(error: unknown): HttpRefusal {
  if (!(error instanceof ModelCallFailed)) throw error;
  return { status: 503, code: 'provider_unavailable', message: 'Сервис ответа временно недоступен' };
}
