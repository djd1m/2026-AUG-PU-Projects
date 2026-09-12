// VerifyTelegramInitData (FR-consent-and-telegram-auth-1, NFR-consent-and-telegram-auth-1).
//
// Порядок ОБЯЗАТЕЛЕН и не эстетика (`security-operation-order.md`): подпись проверяется по
// СЫРЫМ байтам строки проверки (не по разобранному объекту), сравнение — ФУНКЦИЕЙ ПОСТОЯННОГО
// ВРЕМЕНИ, свежесть — ТОЛЬКО после успешной подписи. Единственная точка возврата отказа (шаг 9
// проектного алгоритма) сходится из ОБЕИХ причин («signature», «stale») — сравнение и разбор
// свежести оба ведут к одному `return` ниже, а не к двум независимым.
//
// Секрет HMAC (`secret_key`, `computed_hash`) не логируется НИГДЕ в этом модуле — он не
// покидает область видимости функции.

import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;
/** SHA-256 в hex — 64 символа = 32 байта. Буферы сравнения дополняются до этой длины. */
const HASH_BYTES = 32;

export type VerifyInitDataResult =
  | { readonly ok: true; readonly telegramUserId: string; readonly authDate: number; readonly hash: string }
  | { readonly ok: false; readonly reason: 'missing' | 'signature' | 'stale' };

/** Секрет — производная от токена бота (`HMAC-SHA256("WebAppData", bot_token)`), не сам токен. */
function deriveSecretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
}

/**
 * Сравнение ПОСТОЯННОГО ВРЕМЕНИ. `timingSafeEqual` бросает исключение при разной длине
 * буферов, а не возвращает `false` молча — оба буфера ПРИВОДЯТСЯ к одинаковой длине
 * (дополнением нулями до `HASH_BYTES`) ДО вызова, а исходная длина сверяется отдельно, чтобы
 * несовпадение длины тоже давало `false`, не исключение (Security Architecture, 03_architecture.md).
 */
function constantTimeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.alloc(HASH_BYTES);
  const bufB = Buffer.alloc(HASH_BYTES);
  const rawA = Buffer.from(a, 'hex');
  const rawB = Buffer.from(b, 'hex');
  rawA.copy(bufA, 0, 0, Math.min(rawA.length, HASH_BYTES));
  rawB.copy(bufB, 0, 0, Math.min(rawB.length, HASH_BYTES));
  const paddedEqual = timingSafeEqual(bufA, bufB);
  return paddedEqual && rawA.length === rawB.length;
}

/** Собирает `data-check-string`: отсортированные пары `key=value`, соединённые `\n`. */
function buildDataCheckString(params: URLSearchParams): string {
  const keys = Array.from(new Set(params.keys())).sort();
  const pairs = keys.map((key) => `${key}=${params.get(key) ?? ''}`);
  return pairs.join('\n');
}

export function verifyTelegramInitData(initData: string | undefined, botToken: string): VerifyInitDataResult {
  if (initData === undefined || initData.trim() === '') {
    // Ошибка ВВОДА (422 у вызывающего маршрута), не отказ проверки подлинности (401):
    // различие обязано остаться видимым в коде причины (AC-consent-and-telegram-auth-7).
    return { ok: false, reason: 'missing' };
  }

  const params = new URLSearchParams(initData);
  const presentedHash = params.get('hash');
  params.delete('hash');
  const dataCheckString = buildDataCheckString(params);

  const secretKey = deriveSecretKey(botToken);
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest('hex');

  const signatureValid = presentedHash !== null && constantTimeHexEqual(computedHash, presentedHash);

  let reason: 'signature' | 'stale' | undefined;
  if (!signatureValid) {
    reason = 'signature';
  } else {
    // Свежесть проверяется ТОЛЬКО после успешной подписи, из УЖЕ ПРОВЕРЕННОЙ строки.
    const authDateRaw = params.get('auth_date');
    const authDate = authDateRaw === null ? Number.NaN : Number.parseInt(authDateRaw, 10);
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (!Number.isFinite(authDate) || ageSeconds > MAX_AGE_SECONDS) {
      reason = 'stale';
    }
  }

  if (reason !== undefined) {
    // ЕДИНСТВЕННАЯ точка возврата отказа для ОБЕИХ причин (NFR-consent-and-telegram-auth-1,
    // AC-consent-and-telegram-auth-4) — нет отдельной ранней ветки `if (stale) return …`
    // до проверки подписи.
    return { ok: false, reason };
  }

  const userRaw = params.get('user');
  let telegramUserId = '';
  if (userRaw !== null) {
    try {
      const parsed = JSON.parse(userRaw) as { readonly id?: number | string };
      telegramUserId = parsed.id === undefined ? '' : String(parsed.id);
    } catch {
      telegramUserId = '';
    }
  }

  return {
    ok: true,
    telegramUserId,
    authDate: Number.parseInt(params.get('auth_date') ?? '0', 10),
    hash: presentedHash ?? '',
  };
}
