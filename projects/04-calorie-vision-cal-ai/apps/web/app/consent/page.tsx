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
//
// Задача N4 (замкнуть путь пользователя): экран результата уводит сюда с `?return=<путь>` при
// отказе `403 consent_required` на «в дневник»/«поделиться» и ждёт назад. `resolveDecisionTarget`
// решает, куда: согласие дано — на `returnTo` с `consent=granted` (сигнал получателю повторить
// исходное действие), отказ или отсутствие безопасного пути — на старый `router.back()`
// (совместимость с прямым переходом на `/consent` без параметра, например из теста).
// `window.location.assign`, а не `router.push`, — тот же приём, что и на камере
// (`page.tsx`, «переходы — `window.location.assign`»), намеренно единообразный для ВСЕЙ фичи.

import { useRouter } from 'next/navigation';
import { ConsentScreen } from './screen';
import { resolveDecisionTarget } from './return-path';
import { writeLocalConsentStatus } from './local-status';

const CONSENT_TEXT_HASH = '11c84e9af758ca8858a9f8643ae32b039fce544b5fa85f9ed88a260fb66893db';

function currentReturnParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('return');
}

export default function ConsentPage() {
  const router = useRouter();
  return (
    <ConsentScreen
      consentTextHash={CONSENT_TEXT_HASH}
      onDecided={(decision) => {
        writeLocalConsentStatus(decision === 'grant' ? 'granted' : 'declined');
        const target = resolveDecisionTarget(decision, currentReturnParam());
        if (target !== null) {
          window.location.assign(target);
          return;
        }
        router.back();
      }}
    />
  );
}
