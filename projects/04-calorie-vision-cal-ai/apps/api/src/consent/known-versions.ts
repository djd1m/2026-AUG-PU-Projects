// Список версий текста согласия — КОД-ВЛАДЕЕМЫЙ закрытый список (`honest-configuration.md`
// CFG-I8): множество версий НЕ приходит из окружения, только из кода (02_pseudocode.md,
// Data Structures).
//
// `consent_text_hash` вычисляется СЕРВЕРОМ по байтам канонического текста версии — присланное
// клиентом значение только СВЕРЯЕТСЯ с вычисленным, оно не источник истины. Расхождение — тот
// же `422`, что и неизвестная версия: «согласие на неизвестный текст не является согласием»
// распространяется и на подмену текста.

import { createHash } from 'node:crypto';

/** Канонический текст версии. Дословный текст экрана согласия — источник UI (frontend-design). */
const CONSENT_TEXTS: Readonly<Record<string, string>> = {
  '2026-09-v1':
    'Я согласен(а) на обработку данных о моём питании (фото еды, результаты распознавания, ' +
    'записи дневника) сервисом «Тарелка» как специальной категории персональных данных, ' +
    'а также на их хранение до момента отзыва согласия или удаления аккаунта.',
};

export const KNOWN_CONSENT_VERSIONS: readonly string[] = Object.keys(CONSENT_TEXTS);

export function isKnownConsentVersion(version: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONSENT_TEXTS, version);
}

/** `undefined` — версия неизвестна: вызывающий обязан трактовать это как отказ (`422`). */
export function computeConsentTextHash(version: string): string | undefined {
  const text = CONSENT_TEXTS[version];
  if (text === undefined) return undefined;
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
