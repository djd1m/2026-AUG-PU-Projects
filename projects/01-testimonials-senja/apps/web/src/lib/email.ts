// FR-015 — отправка писем.
//
// ─────────────────────────────────────────────────────────────────────────────
// ЭТО ПЕРВЫЙ ВНЕШНИЙ ВЫЗОВ В ПРОЕКТЕ. До FR-015 ни один путь кода не ходил в сторонний
// сервис, и из этого следуют два требования, которых у остальных модулей нет.
//
// 1. ТАЙМАУТ ОБЯЗАТЕЛЕН. Время ответа провайдера нам не принадлежит. Node исполняет весь
//    продукт в одном потоке, реплика web одна: запрос, висящий минуту в ожидании чужого
//    сервиса, — это минута, в течение которой обработчик занят. Без таймаута верхней
//    границы не существует вовсе.
// 2. ОТКАЗ ПРОВАЙДЕРА — НЕ ОТКАЗ ОПЕРАЦИИ. Правило fail-closed-defaults.md требует, чтобы
//    недоступность источника истины была отказом. Здесь ИСКЛЮЧЕНИЕ, и оно осознанное:
//    почтовый провайдер источником истины не является. Токен восстановления уже выпущен и
//    остаётся годным; ответ человеку не меняется, иначе существующий адрес отличался бы от
//    несуществующего кодом ответа.
//
// SDK `resend` НЕ используется намеренно. API — один POST с bearer-токеном; свой клиент на
// fetch занимает эти двадцать строк, не добавляет звена в цепочку поставки и, главное,
// позволяет задать таймаут, который обёртка наружу не отдаёт. То же решение и по той же
// причине, что со своим разбором CSV в FR-014.
// ─────────────────────────────────────────────────────────────────────────────

/** Верхняя граница ожидания провайдера. 8 с — с запасом над нормальным ответом (сотни мс)
 *  и заметно ниже того, где занятый обработчик становится проблемой. */
export const EMAIL_TIMEOUT_MS = 8_000;

import { randomUUID } from 'node:crypto';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Ключ идемпотентности провайдера: ОДИН на письмо, общий для всех его попыток. Повтор
   *  после таймаута, когда первая попытка на деле дошла, провайдер узнаёт и не шлёт второе. */
  idempotencyKey?: string;
}

/** Отправитель передаётся ПАРАМЕТРОМ там, где используется, а не импортируется внутри
 *  логики. Это даёт две вещи разом: тесты без сети и невозможность вызвать отправку из
 *  функции, которая её не приняла, — то есть изнутри транзакции. */
export type EmailSender = (message: EmailMessage) => Promise<void>;

/**
 * Ключ и адрес отправителя — БЕЗ ПРАВА НА ДЕФОЛТ в проде.
 *
 * Тихий фолбэк здесь означает «человек ждёт письма, которого не будет»: маршрут ответит
 * «письмо отправлено», ничего не отправив. Это ровно класс silent-fallbacks.md, и цена
 * та же — обнаружение переносится на человека, который не дождался.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value && value.trim() !== '') return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${name} не задан. Без него письма восстановления пароля не отправляются, ` +
      'а человек получает ответ «письмо отправлено» и не получает письма.',
    );
  }
  // В dev и test отсутствие ключа законно: отправитель подменяется в тестах, а локальная
  // разработка не должна требовать настройки почты.
  return '';
}

/**
 * Настроена ли почта. Спрашивает ТЕМ ЖЕ requireEnv, что и отправка, — вторая проверка
 * рядом с первой однажды разойдётся с ней, и предикат начнёт врать про свою же отправку.
 *
 * Нужен для честного отказа НА ВХОДЕ в путь восстановления. Без него маршрут отвечает
 * «письмо отправлено», выпускает токен и не отправляет ничего: ровно тот класс, что
 * описан в .claude/rules/silent-fallbacks.md, и наблюдался на стенде 2026-08-30.
 */
export function mailConfigured(): boolean {
  try {
    return requireEnv('RESEND_API_KEY') !== '' && requireEnv('MAIL_FROM') !== '';
  } catch {
    return false;
  }
}

/** Отказ провайдера С КОДОМ: по нему повтор отличает «пройдёт позже» (5xx, 429) от «не
 *  пройдёт никогда» (прочие 4xx — ключ, адрес, формат). */
export class EmailProviderError extends Error {
  constructor(readonly status: number) {
    super(`почтовый провайдер ответил ${status}`);
  }
}

/** Причина отказа для журнала — КАТЕГОРИЯ из закрытого набора, не err.message: текст
 *  исключения чужого отправителя однажды понесёт адрес или ссылку, а журнал переживает всё. */
function failureCategory(err: unknown): string {
  if (err instanceof EmailProviderError) return `provider_${err.status}`;
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'timeout';
  }
  return 'network_or_unknown';
}

/** Повторять имеет смысл только то, что может пройти позже. Сеть и таймаут — да. */
function retryable(err: unknown): boolean {
  if (!(err instanceof EmailProviderError)) return true;
  return err.status >= 500 || err.status === 429;
}

export async function sendViaResend(message: EmailMessage): Promise<void> {
  const apiKey = requireEnv('RESEND_API_KEY');
  const from = requireEnv('MAIL_FROM');
  if (apiKey === '' || from === '') {
    throw new Error('почта не настроена: RESEND_API_KEY или MAIL_FROM пусты');
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(message.idempotencyKey ? { 'idempotency-key': message.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    // Верхняя граница ожидания. Без неё висящий чужой сервис занимает обработчик без предела.
    signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Тело ответа в сообщение НЕ подставляем: оно может содержать адрес получателя, а это
    // персональные данные в журнале.
    throw new EmailProviderError(response.status);
  }
}

/** Пауза перед единственным повтором. Отказ провайдера чаще всего кратковременный (5xx,
 *  оборванное соединение); пауза длиннее занимала бы процесс, короче — била бы в тот же сбой. */
export const EMAIL_RETRY_DELAY_MS = 2_000;
export const EMAIL_ATTEMPTS = 2;

/**
 * Отправка С ПОВТОРОМ и журналом ИСХОДА. Зовётся ПОСЛЕ ответа (after), поэтому её время
 * ответа не касается — и потому же исход виден только в журнале: спросить больше некого.
 *
 * Никогда не бросает: вызывающий уже ответил, бросать некуда, а необработанный отказ в
 * фоне уронил бы процесс вместе с чужими запросами. В журнал — метка, номер попытки и
 * причина. Ни адреса, ни ссылки: журнал переживает всё остальное.
 */
export async function sendWithRetry(
  send: EmailSender,
  message: EmailMessage,
  label: string,
  delayMs: number = EMAIL_RETRY_DELAY_MS,
): Promise<boolean> {
  const keyed: EmailMessage = { ...message, idempotencyKey: message.idempotencyKey ?? randomUUID() };
  for (let attempt = 1; attempt <= EMAIL_ATTEMPTS; attempt += 1) {
    try {
      await send(keyed);
      console.info(`${label}_sent`, { attempt });
      return true;
    } catch (err) {
      const reason = failureCategory(err);
      if (attempt === EMAIL_ATTEMPTS || !retryable(err)) {
        console.error(`${label}_failed`, { attempt, reason });
        return false;
      }
      console.error(`${label}_retry`, { attempt, reason });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

/**
 * Письмо восстановления. Пользовательского текста в нём НЕТ вовсе — только ссылка и срок.
 * Экранировать нечего, и это осознанно: любой пользовательский текст открыл бы вопрос об
 * инъекции в HTML, которого сейчас просто не существует.
 */
export function resetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: 'Восстановление доступа',
    text:
      'Вы запросили восстановление доступа.\n\n' +
      `Ссылка действует один час: ${link}\n\n` +
      'Если это были не вы — письмо можно не читать, пароль останется прежним.',
    html:
      '<p>Вы запросили восстановление доступа.</p>' +
      `<p><a href="${link}">Задать новый пароль</a></p>` +
      '<p>Ссылка действует один час. Если это были не вы — письмо можно не читать, ' +
      'пароль останется прежним.</p>',
  };
}
