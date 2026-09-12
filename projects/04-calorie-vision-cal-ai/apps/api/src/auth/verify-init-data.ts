// VerifyTelegramInitData (FR-consent-and-telegram-auth-1, NFR-consent-and-telegram-auth-1).
//
// Порядок ОБЯЗАТЕЛЕН и не эстетика (`security-operation-order.md`): подпись проверяется по
// СЫРЫМ байтам строки проверки (не по разобранному объекту), сравнение — ФУНКЦИЕЙ ПОСТОЯННОГО
// ВРЕМЕНИ, свежесть — ТОЛЬКО после успешной подписи. Единственная точка возврата отказа (шаг 9
// проектного алгоритма) сходится из ОБЕИХ причин («signature», «stale») — сравнение и разбор
// свежести оба ведут к одному `return` ниже, а не к двум независимым.
//
// Правка по review-report.md RV-consent-and-telegram-auth-03: присланный `hash` ОБЯЗАН пройти
// СТРОГИЙ формат (ровно 64 hex-символа) ДО декодирования — иначе `Buffer.from(x,'hex')` молча
// отбрасывает невалидный хвост (`hash + 'z'` декодируется в ТЕ ЖЕ 32 байта, что и сам `hash`),
// и присланная строка с довеском проходит проверку подписи как подлинная. Возвращаемый `hash` —
// КАНОНИЧЕСКИЙ, вычисленный СЕРВЕРОМ (`computedHash`), а не присланный текст: два текстовых
// представления одной и той же подписи (другой регистр, довесок, поглощённый декодером) не
// имеют права давать РАЗНЫЕ ключи повтора — воспроизведено тестом до этой правки.
//
// Секрет HMAC (`secret_key`, `computed_hash`) не логируется НИГДЕ в этом модуле — он не
// покидает область видимости функции.

import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;
/** Ровно 64 hex-символа = 32 байта SHA-256. Длина и алфавит проверяются ДО декодирования. */
const HEX64_PATTERN = /^[0-9a-f]{64}$/i;

export type VerifyInitDataResult =
  | { readonly ok: true; readonly telegramUserId: string; readonly authDate: number; readonly hash: string }
  | { readonly ok: false; readonly reason: 'missing' | 'signature' | 'stale' };

/** Секрет — производная от токена бота (`HMAC-SHA256("WebAppData", bot_token)`), не сам токен. */
function deriveSecretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
}

/**
 * Сравнение ПОСТОЯННОГО ВРЕМЕНИ. Оба аргумента ОБЯЗАНЫ уже пройти `HEX64_PATTERN` — здесь нет
 * подчистки или усечения невалидного входа: формат проверяется ДО вызова этой функции
 * (`verifyTelegramInitData`), а не внутри неё.
 */
function constantTimeHexEqual(canonicalHex: string, presentedHexLowercased: string): boolean {
  return timingSafeEqual(Buffer.from(canonicalHex, 'hex'), Buffer.from(presentedHexLowercased, 'hex'));
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

  // Формат ПРОВЕРЯЕТСЯ ДО декодирования: строка неверной длины или с недопустимыми символами
  // (в том числе довесок, который `Buffer.from(_, 'hex')` декодировал бы молча) — отказ
  // подписи, а не сравнение усечённых байтов.
  const signatureValid = presentedHash !== null && HEX64_PATTERN.test(presentedHash) && constantTimeHexEqual(computedHash, presentedHash.toLowerCase());

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
    // КАНОНИЧЕСКИЙ hash — вычисленный сервером, а не присланный текст (RV-03): два текстовых
    // представления одной подписи обязаны давать ОДИН ключ повтора.
    hash: computedHash,
  };
}
