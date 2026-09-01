// Доставка в мессенджер владельца.
//
// МОМЕНТ ЦЕННОСТИ ПРОДУКТА: владелец получает первое приватное сообщение В ТУ ЖЕ СМЕНУ,
// пока гость ещё в заведении. Не письмо, не дашборд — push, который читают.

export interface SendResult { ok: boolean; retriable: boolean; error?: string; }

const TIMEOUT_MS = 8_000;

/** Отправка. Внешний вызов ОБЯЗАН иметь таймаут: время ответа чужого сервиса нам не
 *  принадлежит, а процесс один. Без него верхней границы ожидания не существует вовсе. */
export async function sendTelegram(chatId: string, text: string, token: string): Promise<SendResult> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) return { ok: true, retriable: false };
    // 4xx — наша ошибка (неверный chat_id, бот заблокирован): повтор не поможет.
    // 5xx и сеть — их сбой: повторяем.
    const retriable = r.status >= 500;
    return { ok: false, retriable, error: `telegram ${r.status}` };
  } catch (e) {
    return { ok: false, retriable: true, error: (e as Error).message };
  }
}
