'use client';

// Камера ПЕРВЫМ экраном (FR-foundation-7, FR-CAPTURE-001, FR-LOOK-006).
//
// Ни анкеты, ни регистрации, ни экрана согласия до съёмки: согласие спрашивается перед
// ПЕРВОЙ записью дневника (ADR-009), а не на входе. Форм на этом экране нет вовсе — это
// и есть проверяемое свойство.
//
// Кадр НИКУДА НЕ ОТПРАВЛЯЕТСЯ: приём фото вводит фича `scan-pipeline`. Кнопка съёмки
// названа заглушкой в интерфейсе, а не притворяется работающей.

import { useEffect, useRef, useState } from 'react';

type CameraState = 'idle' | 'live' | 'denied' | 'unsupported';

export default function CameraFirstScreen() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>('idle');

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
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <main className="screen">
      <section className="viewfinder" aria-label="видоискатель">
        <video ref={videoRef} className="viewfinder__video" autoPlay playsInline muted />
        <div className="viewfinder__frame" aria-hidden="true" />
        {state === 'denied' ? <p className="viewfinder__notice">Нет доступа к камере. Разрешите доступ или выберите фото из галереи.</p> : null}
        {state === 'unsupported' ? <p className="viewfinder__notice">Камера в этом браузере недоступна. Выберите фото из галереи.</p> : null}
      </section>

      <nav className="modes" aria-label="режимы">
        <span className="modes__item modes__item--active">съёмка</span>
        <span className="modes__item">галерея</span>
      </nav>

      <button
        type="button"
        className="shutter"
        aria-label="снять кадр"
        onClick={() => {
          /* Заглушка: приём кадра вводит фича scan-pipeline. Здесь кадр никуда не уходит. */
        }}
      >
        <span className="shutter__ring" aria-hidden="true" />
      </button>
    </main>
  );
}
