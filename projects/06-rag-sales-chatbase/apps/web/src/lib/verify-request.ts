// Отметка «Я проверил ответы бота» (A-N6-035) из браузера — один путь для экрана бота и экрана установки
// (gate-onboarding, ревью круга 1: логика запроса вынесена из экранов, чтобы проверяться без браузера).
// Успех — только 200 с булевым answers_verified; любая иная форма — ошибка с текстом, а не «отметка стоит».
import { dataOf, errorOf, send } from './api-client';

export type VerifyOutcome = { ok: true; verified: boolean } | { ok: false; message: string };
type Sender = typeof send;

export async function requestVerify(botId: string, verified: boolean, sender: Sender = send): Promise<VerifyOutcome> {
  try {
    const { status, body } = await sender(`/api/bots/${botId}/verify`, 'POST', { verified });
    const data = dataOf<{ answers_verified: unknown }>(body);
    if (status === 200 && data && typeof data.answers_verified === 'boolean') return { ok: true, verified: data.answers_verified };
    return { ok: false, message: errorOf(body)?.message ?? 'Не удалось сохранить отметку. Повторите' };
  } catch {
    return { ok: false, message: 'Нет связи с сервером. Повторите' };
  }
}
