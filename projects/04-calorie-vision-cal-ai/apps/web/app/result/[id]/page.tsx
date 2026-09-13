'use client';

// Маршрут результата — `GET /api/v1/scans/{id}` (RV-source-and-correct-01, слепое ревью
// 2026-09-13). До этой правки `result-screen.tsx` нигде не подключался: маршрута не было,
// кнопки не имели обработчиков. Здесь — единственное место, где `apps/web` делает сетевые
// запросы к `apps/api`: относительным путём `/api/v1/...`, тем же origin, что и сама
// страница (Caddy, профиль `edge`, `handle /api/* { reverse_proxy api:3000 }`) — второго
// адреса заводить незачем и запрещено политикой `connect-src 'self'` (`middleware.ts`).
//
// Поллинг — пока статус не терминален (`queued`); `done`/`failed`/`refused` завершают его.
// После каждого `correct` ответ сервера ЗАМЕНЯЕТ локальное состояние целиком: сервер —
// источник истины (FR-source-and-correct-12, `RenderResultSurface` шаг 5).
//
// Задача N4 (замкнуть путь пользователя): здесь же — «в дневник» (`PATCH /diary/{id}`) и
// «поделиться» (`POST /share-cards`). Оба маршрута могут отказать `403 consent_required`
// (запись дневника ТРЕБУЕТ согласия по построению; карточка — несёт те же данные о питании,
// тот же гейт на сервере, `create-share-card.ts`) — экран уводит на `/consent?return=…` и ждёт
// назад. Возврат несёт `?consent=granted&intent=diary|share` — сигнал повторить РОВНО то
// действие, ради которого согласие спрашивалось (не оба и не наугад).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ScanResultScreen, type ReplaceCandidate, type ScanResultResponse } from '../result-screen';
import { buildCorrectRequest, type CorrectAction } from '../correct-request';
import { buildDiaryConfirmRequest, parseDiaryConfirmResponse } from '../diary-confirm-request';
import { buildShareCreateRequest, parseShareCreateResponse, absoluteCardUrl } from '../share-request';
import { buildConsentUrl } from '../../consent/return-path';

type LoadState = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'scan'; readonly scan: ScanResultResponse & { readonly status: string; readonly failure_reason: string | null } };

type ShareState = { readonly kind: 'idle' } | { readonly kind: 'ready'; readonly url: string; readonly copied: boolean };

const POLL_MS = 1500;

/** Отменённый шторкой `navigator.share` (пользователь закрыл диалог) — НЕ ошибка, ссылка всё
 * равно показывается ниже кнопки; любая ДРУГАЯ причина отказа — тоже не блокирует показ ссылки
 * (сама карточка УЖЕ создана к этому моменту), только не заменяется автокопированием. */
async function tryNativeShare(url: string): Promise<boolean> {
  const shareFn = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
  if (typeof shareFn !== 'function') return false;
  try {
    await shareFn.call(navigator, { title: 'Тарелка', url });
  } catch {
    // AbortError (отмена) и любой другой отказ шторки — молча, ссылка ниже остаётся доступной.
  }
  return true;
}

async function tryCopyToClipboard(url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

async function parseJsonOrThrow(response: Response): Promise<{ data: unknown }> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body !== null && typeof body === 'object' && 'error' in body ? JSON.stringify((body as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as { data: unknown };
}

export default function ScanResultPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const scanId = params.id;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [journeyNotice, setJourneyNotice] = useState<string | null>(null);
  const [share, setShare] = useState<ShareState>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/v1/scans/${scanId}`, { credentials: 'same-origin' });
      const body = await parseJsonOrThrow(response);
      const scan = body.data as ScanResultResponse & { status: string; failure_reason: string | null };
      setState({ kind: 'scan', scan });
      if (scan.status === 'queued') {
        timerRef.current = setTimeout(() => void load(), POLL_MS);
      }
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'не удалось получить скан' });
    }
  }, [scanId]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [load]);

  const correct = useCallback(
    async (action: CorrectAction): Promise<ScanResultResponse & { status: string; failure_reason: string | null; candidates?: readonly ReplaceCandidate[] }> => {
      const { url, body } = buildCorrectRequest(scanId, action);
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = await parseJsonOrThrow(response);
      return parsed.data as ScanResultResponse & { status: string; failure_reason: string | null; candidates?: readonly ReplaceCandidate[] };
    },
    [scanId],
  );

  /** Уводит на согласие и запоминает, куда вернуться (`?intent=` несёт, ЧТО повторить —
   * ровно то действие, которое отказало, не оба и не наугад). */
  const goToConsent = useCallback(
    (intent: 'diary' | 'share'): void => {
      if (typeof window === 'undefined') return;
      window.location.assign(buildConsentUrl(`/result/${scanId}?intent=${intent}`));
    },
    [scanId],
  );

  const confirmToDiary = useCallback(async (): Promise<void> => {
    setJourneyNotice(null);
    const { url, init } = buildDiaryConfirmRequest(scanId);
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      setJourneyNotice('Нет соединения — проверьте сеть и попробуйте ещё раз.');
      return;
    }
    const outcome = await parseDiaryConfirmResponse(response);
    if (outcome.kind === 'confirmed') {
      // Дневник — ИСТОЧНИК ИСТИНЫ сразу после записи; полная навигация (не роутер), тот же
      // приём, что и переход камеры на результат.
      window.location.assign('/diary');
      return;
    }
    if (outcome.kind === 'consent_required') {
      goToConsent('diary');
      return;
    }
    if (outcome.kind === 'not_found') {
      setJourneyNotice('Скан не найден — возможно, ссылка устарела.');
      return;
    }
    if (outcome.kind === 'not_done') {
      setJourneyNotice(outcome.failureReason ?? 'Скан ещё не завершён — подождите немного и попробуйте снова.');
      return;
    }
    setJourneyNotice(outcome.message);
  }, [scanId, goToConsent]);

  const shareItem = useCallback(async (): Promise<void> => {
    setJourneyNotice(null);
    const { url, init } = buildShareCreateRequest(scanId);
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      setJourneyNotice('Нет соединения — проверьте сеть и попробуйте ещё раз.');
      return;
    }
    const outcome = await parseShareCreateResponse(response);
    if (outcome.kind === 'consent_required') {
      goToConsent('share');
      return;
    }
    if (outcome.kind === 'not_found') {
      setJourneyNotice('Скан не найден — возможно, ссылка устарела.');
      return;
    }
    if (outcome.kind === 'not_done') {
      setJourneyNotice('Скан ещё не завершён — подождите немного и попробуйте снова.');
      return;
    }
    if (outcome.kind === 'error') {
      setJourneyNotice(outcome.message);
      return;
    }

    const absolute = typeof window !== 'undefined' ? absoluteCardUrl(outcome.url, window.location.origin) : outcome.url;
    const shared = await tryNativeShare(absolute);
    const copied = shared ? false : await tryCopyToClipboard(absolute);
    setShare({ kind: 'ready', url: absolute, copied });
  }, [scanId, goToConsent]);

  // Возврат с экрана согласия (`?consent=granted&intent=…`): повторить РОВНО то действие,
  // ради которого согласие спрашивалось, автоматически — тот самый момент пути, ради которого
  // согласие спрашивается не на входе (ADR-009). Параметры вычищаются из адресной строки СРАЗУ,
  // иначе обновление страницы (F5) повторило бы действие второй раз.
  useEffect(() => {
    if (state.kind !== 'scan' || state.scan.status !== 'done') return;
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('consent') !== 'granted') return;
    const intent = searchParams.get('intent') === 'share' ? 'share' : 'diary';
    searchParams.delete('consent');
    searchParams.delete('intent');
    const query = searchParams.toString();
    window.history.replaceState(null, '', query === '' ? window.location.pathname : `${window.location.pathname}?${query}`);
    void (intent === 'share' ? shareItem() : confirmToDiary());
  }, [state, confirmToDiary, shareItem]);

  if (state.kind === 'loading') return <p className="result__status">загрузка…</p>;
  if (state.kind === 'error') return <p className="result__status result__status--error">{state.message}</p>;
  if (state.kind === 'scan' && state.scan.status === 'queued') return <p className="result__status">распознаётся…</p>;
  if (state.kind === 'scan' && state.scan.status !== 'done') {
    // failed/refused (задача N4, пункт 1): причина понятным текстом + возврат к камере —
    // обычная ссылка, тот же приём, что и «к камере» на самом экране результата.
    return (
      <div className="result__status">
        <p>{state.scan.failure_reason ?? 'блюда нет в базе, уточните ингредиент вручную'}</p>
        <a href="/" className="btn btn--primary">
          снять ещё раз
        </a>
      </div>
    );
  }

  const scan = state.scan;
  return (
    <>
      <ScanResultScreen
        scan={scan}
        journeyNotice={journeyNotice}
        actions={{
          onSetPortion: async (index, massG) => {
            const updated = await correct({ op: 'set_portion', index, massG });
            setState({ kind: 'scan', scan: updated });
          },
          onDelete: async (index) => {
            const updated = await correct({ op: 'delete_item', index });
            setState({ kind: 'scan', scan: updated });
          },
          onSearchReplace: async (query): Promise<readonly ReplaceCandidate[]> => {
            const updated = await correct({ op: 'replace_item_search', query });
            return updated.candidates ?? [];
          },
          onReplace: async (index, foodItemId) => {
            const updated = await correct({ op: 'replace_item_select', index, foodItemId });
            setState({ kind: 'scan', scan: updated });
          },
          onResolveConflict: async () => {
            const updated = await correct({ op: 'resolve_conflict' });
            setState({ kind: 'scan', scan: updated });
          },
          onGoToDiary: confirmToDiary,
          onShare: shareItem,
        }}
      />
      {share.kind === 'ready' ? (
        <div className="share-panel" role="status" aria-label="карточка готова">
          <p className="share-panel__url">{share.url}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              void tryCopyToClipboard(share.url).then((copied) => setShare({ kind: 'ready', url: share.url, copied }));
            }}
          >
            {share.copied ? 'скопировано' : 'скопировать ссылку'}
          </button>
        </div>
      ) : null}
    </>
  );
}
