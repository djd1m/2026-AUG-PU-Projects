'use client';

// Маршрут экрана согласия (FR-consent-and-telegram-auth-13). Вызывается со страницы
// результата распознавания ПЕРЕД первой попыткой сохранить запись дневника — сам переход
// сюда вводит `scan-pipeline` (владелец экрана результата); этот маршрут — самостоятельная
// точка входа для прямого перехода и для теста.
//
// `CONSENT_TEXT_HASH` — тот же sha256 канонического текста версии `2026-09-v1`, что вычисляет
// `apps/api/src/consent/known-versions.ts` (сервер СВЕРЯЕТ присланный хэш с вычисленным сам,
// подмена не пройдёт — эта константа лишь избавляет клиента от повторного вычисления sha256
// в браузере одного и того же неизменного текста).

import { useRouter } from 'next/navigation';
import { ConsentScreen } from './screen';

const CONSENT_TEXT_HASH = '11c84e9af758ca8858a9f8643ae32b039fce544b5fa85f9ed88a260fb66893db';

export default function ConsentPage() {
  const router = useRouter();
  return (
    <ConsentScreen
      consentTextHash={CONSENT_TEXT_HASH}
      onDecided={() => {
        router.back();
      }}
    />
  );
}
