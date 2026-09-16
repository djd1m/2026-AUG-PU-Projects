// ЕДИНСТВЕННОЕ место, где сервис `web` читает `process.env` (тот же принцип, что
// `apps/api/src/env.ts` и `apps/recognizer/src/env.ts`, `tests/unit/source-guards.test.ts`
// «страж чтения окружения» — сверяет чтения ИСХОДНИКОВ СЕРВИСА с блоком `environment:` этого
// сервиса в compose, и умеет это делать только если чтение сосредоточено в одном файле).
//
// До фичи `share-card-and-growth-events` `web` не читал `process.env` вовсе (секретов вызова
// наружу у него нет, `next.config.mjs`) — маршрут 6 (`GET /c/{card_id}`) первым потребовал
// адрес `api` для внутреннего сетевого вызова (`API_INTERNAL_URL`, уже объявлен в
// `docker-compose.yml` для сервиса `web`, `foundation`).
//
// НЕ импортирует `@n4/shared` (`requireText`/`collectConfig`) — `apps/web` сегодня не объявляет
// эту межпакетную зависимость (`apps/web/package.json`), и заводить её ради одной проверки
// значило бы править `package-lock.json` в обход координатора слияния. Отказ здесь ПРОЩЕ:
// одна обязательная строка, брошенное исключение при отсутствии
// (`.claude/rules/silent-fallbacks.md` — переменная, определяющая внешний вызов, дефолта иметь
// не должна).

export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface WebConfig {
  readonly apiInternalUrl: string;
  /** Цена подписки в КОПЕЙКАХ и потолки — показываются на экране Pro. Секретом не являются,
   * но и значения по умолчанию не имеют: цена, взятая с потолка, — это цена, которую
   * человек увидит и не получит. */
  readonly subscriptionPriceMinor: number;
  readonly scanLimitFree: number;
  readonly scanLimitPro: number;
  /** Режим платежей — НЕ секрет, а надпись на экране: в режиме `fake` кнопка не списывает
   * денег, и человек обязан это видеть ДО нажатия. */
  readonly paymentsMode: 'fake' | 'live';
  /**
   * Имя бота Telegram для ссылки входа. НЕ секрет (токен бота живёт только в `api`), но и не
   * литерал в разметке: до 16.09.2026 `t.me/tarelka_bot` было зашито в `settings/page.tsx`, а
   * настоящий бот проекта называется иначе — кнопка «Войти через Telegram» вела на ЧУЖОГО бота.
   * Имя, которого нет, — отказ, а не «наверное, тот самый» (`silent-fallbacks.md`).
   */
  readonly telegramBotUsername: string;
}

function requirePositiveInt(env: EnvSource, name: string, consequence: string): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') throw new Error(`${name} не задан — ${consequence}`);
  if (!/^[1-9][0-9]*$/.test(raw.trim())) throw new Error(`${name} непригоден («${raw}») — ${consequence}`);
  return Number(raw.trim());
}

function requirePaymentsMode(env: EnvSource): 'fake' | 'live' {
  const raw = env.N4_PAYMENTS_MODE;
  // Неизвестное значение НЕ трактуется как `live`: подписать «деньги списываются» под
  // кнопкой, которая их не списывает, — обман; обратная ошибка безобиднее (fail-closed).
  if (raw === 'live') return 'live';
  return 'fake';
}

/** `@name_bot` без собачки, латиница/цифры/подчёркивание — как требует Telegram. */
function requireBotUsername(env: EnvSource): string {
  const raw = (env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  if (raw === '') throw new Error('TELEGRAM_BOT_USERNAME не задан — кнопка входа через Telegram повела бы в никуда или на чужого бота');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(raw)) throw new Error(`TELEGRAM_BOT_USERNAME непригоден («${raw}») — имя бота Telegram это 5-32 символа A-Z, 0-9, _`);
  return raw;
}

export function loadWebConfig(env: EnvSource = process.env): WebConfig {
  const apiInternalUrl = env.API_INTERNAL_URL;
  if (apiInternalUrl === undefined || apiInternalUrl.trim() === '') {
    throw new Error('API_INTERNAL_URL не задан — маршруты /c/{card_id} не могут обратиться к api');
  }
  return {
    apiInternalUrl,
    subscriptionPriceMinor: requirePositiveInt(env, 'N4_SUBSCRIPTION_PRICE_MINOR', 'экран Pro показал бы цену, которой нет'),
    scanLimitFree: requirePositiveInt(env, 'N4_SCAN_LIMIT_USER', 'экран Pro не смог бы назвать бесплатный путь'),
    scanLimitPro: requirePositiveInt(env, 'N4_SCAN_LIMIT_PRO', 'экран Pro не смог бы назвать, что даёт подписка'),
    paymentsMode: requirePaymentsMode(env),
    telegramBotUsername: requireBotUsername(env),
  };
}
