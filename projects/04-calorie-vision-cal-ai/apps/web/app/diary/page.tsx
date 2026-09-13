'use client';

// Экран дня (задача N4, «замкнуть путь пользователя»): «в дневник» на экране результата ведёт
// СЮДА. `GET /api/v1/diary?date=YYYY-MM-DD` — маршрут 4 канона (`routes/diary.ts`), требует
// активную сессию устройства — тот же приём восстановления после `401`, что и
// `capture-upload.ts` (создать сессию, повторить РОВНО один раз).
//
// Дата — календарная строка `YYYY-MM-DD` по Москве; «сегодня» вычисляется ТОЛЬКО в эффекте
// после монтирования (не при первом рендере) — иначе серверный и клиентский первый рендер
// могли бы разойтись на одну секунду вокруг полуночи, и React пометил бы это гидратационным
// расхождением. Тот же приём — для локальной подсказки согласия (`readLocalConsentStatus`):
// она читает `localStorage`, которого на сервере нет вовсе.

import { useCallback, useEffect, useState } from 'react';
import {
  buildDiaryUrl,
  canGoForward,
  mealSlotLabel,
  moscowDateString,
  parseDiaryDayResponse,
  shiftCalendarDate,
  type DiaryDay,
} from './diary-request';
import { readLocalConsentStatus, type LocalConsentStatus } from '../consent/local-status';

type DayState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'invalid_date' }
  | { readonly kind: 'ok'; readonly day: DiaryDay };

const AUTH_DEVICE_URL = '/api/v1/auth/device';

async function fetchDiaryDay(date: string): Promise<Response> {
  return fetch(buildDiaryUrl(date), { credentials: 'same-origin' });
}

export default function DiaryPage(): React.JSX.Element {
  const [date, setDate] = useState<string | null>(null);
  const [state, setState] = useState<DayState>({ kind: 'loading' });
  const [consentHint, setConsentHint] = useState<LocalConsentStatus>('unknown');

  const load = useCallback(async (targetDate: string): Promise<void> => {
    setState({ kind: 'loading' });
    let response: Response;
    try {
      response = await fetchDiaryDay(targetDate);
    } catch {
      setState({ kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' });
      return;
    }
    if (response.status === 401) {
      // Прямой переход на /diary без предшествующего скана — сессии ещё может не быть.
      // Тот же приём восстановления, что и `capture-upload.ts`: создать и повторить один раз.
      try {
        await fetch(AUTH_DEVICE_URL, { method: 'POST', credentials: 'same-origin' });
        response = await fetchDiaryDay(targetDate);
      } catch {
        setState({ kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' });
        return;
      }
    }
    const outcome = await parseDiaryDayResponse(response);
    if (outcome.kind === 'ok') {
      setState({ kind: 'ok', day: outcome.day });
      return;
    }
    if (outcome.kind === 'invalid_date') {
      setState({ kind: 'invalid_date' });
      return;
    }
    if (outcome.kind === 'unauthenticated') {
      setState({ kind: 'error', message: 'Не удалось открыть сессию — обновите страницу.' });
      return;
    }
    setState({ kind: 'error', message: outcome.message });
  }, []);

  useEffect(() => {
    const today = moscowDateString(new Date());
    setDate(today);
    setConsentHint(readLocalConsentStatus());
    void load(today);
  }, [load]);

  const goToDate = (nextDate: string): void => {
    setDate(nextDate);
    void load(nextDate);
  };

  const today = moscowDateString(new Date());
  const forwardAllowed = date !== null && canGoForward(date, today);

  return (
    <main className="page diary" aria-label="экран дня">
      <h1>Дневник</h1>

      <nav className="diary__nav" aria-label="переключение даты">
        <button type="button" className="btn btn--ghost" disabled={date === null} onClick={() => date !== null && goToDate(shiftCalendarDate(date, -1))}>
          ← вчера
        </button>
        <span className="diary__date">{date ?? '…'}</span>
        <button type="button" className="btn btn--ghost" disabled={!forwardAllowed} onClick={() => date !== null && goToDate(shiftCalendarDate(date, 1))}>
          завтра →
        </button>
      </nav>

      {consentHint === 'declined' ? (
        <div className="card diary__consent-banner" role="status">
          <p>Согласие на обработку данных о питании не дано — дневник не ведётся.</p>
          <a href="/consent" className="btn btn--primary btn--tiny">
            дать согласие
          </a>
        </div>
      ) : null}

      {state.kind === 'loading' ? <p className="result__status">загрузка…</p> : null}
      {state.kind === 'error' ? <p className="result__status result__status--error">{state.message}</p> : null}
      {state.kind === 'invalid_date' ? <p className="result__status result__status--error">Эта дата недоступна.</p> : null}

      {state.kind === 'ok' ? (
        <>
          <section className="result__tiles" aria-label="итог дня">
            <div className="tile tile--kcal">
              <span className="tile__value">{state.day.totals.kcal}</span>
              <span className="tile__label">ккал</span>
            </div>
            <div className="tile">
              <span className="tile__value">{state.day.totals.protein}</span>
              <span className="tile__label">белки</span>
            </div>
            <div className="tile">
              <span className="tile__value">{state.day.totals.fat}</span>
              <span className="tile__label">жиры</span>
            </div>
            <div className="tile">
              <span className="tile__value">{state.day.totals.carb}</span>
              <span className="tile__label">углеводы</span>
            </div>
          </section>

          <div className="card diary__streak" aria-label="стрик">
            <p>
              Стрик: <strong>{state.day.streak.days}</strong> {state.day.streak.days === 1 ? 'день' : 'дней'} подряд
            </p>
            {state.day.streak.frozen_days.length > 0 ? (
              <p className="muted">заморожено: {state.day.streak.frozen_days.join(', ')}</p>
            ) : null}
          </div>

          {state.day.entries.length === 0 ? (
            <p className="diary__empty muted">За этот день записей нет.</p>
          ) : (
            <ul className="diary__entries">
              {state.day.entries.map((entry) => (
                // Задача N4 (дефект «нельзя вернуться к блюду и поделиться»): запись дня ведёт
                // на экран результата ТОГО ЖЕ скана (`recognition_id` уже есть в ответе маршрута
                // 4, `routes/diary.ts::entryPayload`) — там уже есть кнопка «поделиться».
                // Обычная ссылка, не JS-обработчик — тот же приём навигации, что у «к камере».
                <li key={entry.entry_id} className="diary__entry">
                  <a href={`/result/${entry.recognition_id}`} className="item diary__entry-link" aria-label={`открыть запись: ${mealSlotLabel(entry.meal_slot)}, ${entry.kcal_total} ккал`}>
                    <span className="diary__entry-meal">{mealSlotLabel(entry.meal_slot)}</span>
                    <span className="item__kcal">{entry.kcal_total} ккал</span>
                    <ul className="diary__entry-items muted">
                      {entry.items.map((item, index) => (
                        <li key={index}>
                          {item.unmatched === true ? `${item.label_ru ?? '—'} (нет в базе)` : `${item.label_ru ?? '—'}, ${item.mass_g ?? 0} г`}
                        </li>
                      ))}
                    </ul>
                    <span className="diary__entry-open" aria-hidden="true">
                      открыть и поделиться →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <a href="/" className="btn btn--ghost btn--wide result__back">
        к камере
      </a>
    </main>
  );
}
