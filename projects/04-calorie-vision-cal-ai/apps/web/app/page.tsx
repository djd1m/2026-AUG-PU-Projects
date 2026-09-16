'use client';

// Камера ПЕРВЫМ экраном (FR-foundation-7, FR-CAPTURE-001, FR-LOOK-006).
//
// Ни анкеты, ни регистрации, ни экрана согласия до съёмки: согласие спрашивается перед
// ПЕРВОЙ записью дневника (ADR-009), а не на входе. Форм на этом экране нет вовсе — это
// и есть проверяемое свойство (`tests/integration/web-shell.test.tsx`).
//
// Кнопка съёмки и выбор из галереи СОЕДИНЕНЫ с приёмом фото (задача N4, дефект стыка): три
// фичи — `foundation` (эта кнопка), `scan-pipeline` (`POST /api/v1/scans`) и
// `source-and-correct` (`/result/[id]`) — были каждая по отдельности рабочими и зелёными, а
// путь целиком не собрал ни одна. Отправка вынесена в чистый модуль `capture-upload.ts`,
// проверяемый без браузера; этот файл — только DOM: получить кадр и разобрать исход отправки.

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadCapture, type UploadOutcome } from './capture-upload';
import { LimitScreen } from './limit/screen';

type CameraState = 'idle' | 'live' | 'denied' | 'unsupported';

type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'notice'; readonly message: string };

type LimitState = { readonly scope: string | undefined; readonly resetAt: string | undefined };

export default function CameraFirstScreen() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const [limit, setLimit] = useState<LimitState | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;

    const start = async (): Promise<void> => {
      if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
        setState('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current !== null) videoRef.current.srcObject = stream;
        setState('live');
      } catch {
        // Отказ в доступе — НАЗВАННОЕ состояние, а не вечный чёрный прямоугольник.
        setState('denied');
      }
    };

    void start();
    // Разрешение, которое не дали и не отклонили (окно закрыли, вкладка неактивна), оставляло
    // экран в состоянии `idle` НАВСЕГДА: кнопка была недоступна, и нажатие не давало НИЧЕГО —
    // ровно тот отказ, который владелец увидел на живом стенде. Молчание не является
    // состоянием: через 6 секунд оно становится названным.
    const idleDeadline = setTimeout(() => {
      if (!cancelled) setState((current) => (current === 'idle' ? 'denied' : current));
    }, 6000);

    return () => {
      clearTimeout(idleDeadline);
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleOutcome = useCallback((outcome: UploadOutcome): void => {
    if (outcome.kind === 'queued') {
      setSend({ kind: 'idle' });
      // Полная навигация, не `next/navigation`-роутер: этот экран — корневой маршрут,
      // рендерится и напрямую (`renderToStaticMarkup` в `web-shell.test.tsx`) вне контекста
      // приложения Next — `useRouter()` там падает с «app router не смонтирован». Маршрут
      // результата существует и сам себя отрисовывает (`web-result-route.test.ts`).
      window.location.assign(`/result/${outcome.scanId}`);
      return;
    }
    if (outcome.kind === 'limit') {
      setLimit({ scope: outcome.scope, resetAt: outcome.resetAt });
      setSend({ kind: 'idle' });
      return;
    }
    // 'rejected' | 'error' — оба показываются одинаково: названное сообщение вместо
    // общего «что-то пошло не так» (задача N4, пункт 5).
    setSend({ kind: 'notice', message: outcome.message });
  }, []);

  const sendBlob = useCallback(
    async (blob: Blob): Promise<void> => {
      setSend({ kind: 'sending' });
      const outcome = await uploadCapture(blob);
      handleOutcome(outcome);
    },
    [handleOutcome],
  );

  const onShutter = useCallback((): void => {
    // Кнопка недоступна, пока поток не запущен, а не молча ничего не делает (задача N4, п.1).
    if (state !== 'live' || send.kind === 'sending') return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video === null || canvas === null) return;

    // Размер кадра — из РЕАЛЬНЫХ videoWidth/videoHeight, а не из размеров элемента разметки.
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      setSend({ kind: 'notice', message: 'Видео ещё не готово — подождите и попробуйте снова.' });
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      setSend({ kind: 'notice', message: 'Не удалось снять кадр — попробуйте ещё раз.' });
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          setSend({ kind: 'notice', message: 'Не удалось снять кадр — попробуйте ещё раз.' });
          return;
        }
        void sendBlob(blob);
      },
      'image/jpeg',
      0.9,
    );
  }, [state, send.kind, sendBlob]);

  const onGalleryPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = ''; // тот же файл можно выбрать повторно
      if (file === undefined) return;
      void sendBlob(file);
    },
    [sendBlob],
  );

  // Экран лимита ЗАНИМАЕТ место результата (задача N4, п.5): сырые scope/reset_at идут в
  // готовый компонент без форматирования здесь — он форматирует их сам.
  if (limit !== null) return <LimitScreen scope={limit.scope} resetAt={limit.resetAt} />;

  return (
    <main className="screen">
      {/* Переход в дневник, кабинет и настройки — С ГЛАВНОГО экрана (продуктовое задание:
          кабинет партнёра и владельца доступны из приложения). Это ссылки, не формы и не
          `modes__item` — структурный тест главной (`web-shell.test.tsx`) считает режимы и
          запрещает формы, и то и другое остаётся как было. */}
      <nav className="topbar" aria-label="разделы">
        <a href="/diary">дневник</a>
        <a href="/cabinet">кабинет</a>
        <a href="/settings">настройки</a>
      </nav>
      <section className="viewfinder" aria-label="видоискатель">
        <video ref={videoRef} className="viewfinder__video" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="viewfinder__canvas" aria-hidden="true" hidden />
        <div className="viewfinder__frame" aria-hidden="true" />
        {state === 'idle' ? <p className="viewfinder__notice">Запрашиваем доступ к камере… Если окно разрешения не появилось, нажмите круглую кнопку — откроется выбор фото.</p> : null}
        {state === 'denied' ? <p className="viewfinder__notice">Нет доступа к камере. Нажмите круглую кнопку или «галерея», чтобы выбрать фото.</p> : null}
        {state === 'unsupported' ? <p className="viewfinder__notice">Камера в этом браузере недоступна. Выберите фото из галереи.</p> : null}
        {send.kind === 'notice' ? (
          <p className="viewfinder__notice" role="alert">
            {send.message}
          </p>
        ) : null}
      </section>

      <nav className="modes" aria-label="режимы">
        <span className="modes__item modes__item--active">съёмка</span>
        <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={send.kind === 'sending'} className="modes__item">
          галерея
        </button>
      </nav>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="выбрать фото из галереи"
        disabled={send.kind === 'sending'}
        onChange={onGalleryPick}
      />

      <button
        type="button"
        className="shutter"
        aria-label="снять кадр"
        disabled={send.kind === 'sending'}
        onClick={state === 'live' ? onShutter : () => galleryInputRef.current?.click()}
      >
        <span className="shutter__ring" aria-hidden="true" />
      </button>
    </main>
  );
}
