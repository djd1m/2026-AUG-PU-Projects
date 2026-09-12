// Формат TELEGRAM_BOT_TOKEN (FR-consent-and-telegram-auth-4, AC-consent-and-telegram-auth-19).
//
// compose уже ловит ОТСУТСТВИЕ и ПУСТОТУ (`${TELEGRAM_BOT_TOKEN:?…}`, foundation) — БЕЗУСЛОВНО,
// до старта процесса. Эта проверка ДОПОЛНИТЕЛЬНАЯ поверх неё: синтаксически невалидное, но
// непустое значение обязано валить старт с НАЗВАННОЙ причиной здесь, в `env.ts`
// (`ValidateTelegramBotTokenFormat`, вызывается ОДИН раз, до регистрации маршрутов) — а не
// бросать необработанное исключение при первом вычислении HMAC-секрета внутри
// `verify-init-data.ts`, когда процесс уже принимает запросы.

/** Формат токена Bot API: `<цифры>:<35 символов A-Za-z0-9_->`. */
export const TELEGRAM_BOT_TOKEN_PATTERN = /^[0-9]+:[A-Za-z0-9_-]{35}$/;

export function isValidTelegramBotTokenFormat(value: string): boolean {
  return TELEGRAM_BOT_TOKEN_PATTERN.test(value);
}
