// Страж: константа `CONSENT_TEXT_HASH`, зашитая в `apps/web/app/consent/page.tsx` (чтобы не
// пересчитывать sha256 неизменного текста в браузере), обязана совпадать с тем, что вычисляет
// сервер (`apps/api/src/consent/known-versions.ts`) — иначе клиент навсегда получал бы `422
// unknown_consent_version` после малейшей правки канонического текста на сервере.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';

describe('синхронность CONSENT_TEXT_HASH клиента с сервером', () => {
  it('хэш в apps/web/app/consent/page.tsx совпадает с computeConsentTextHash("2026-09-v1")', async () => {
    const pageSource = await readFile(new URL('../../apps/web/app/consent/page.tsx', import.meta.url), 'utf8');
    const match = /CONSENT_TEXT_HASH = '([0-9a-f]{64})'/.exec(pageSource);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(computeConsentTextHash('2026-09-v1'));
  });
});
