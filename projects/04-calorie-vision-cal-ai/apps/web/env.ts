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
}

export function loadWebConfig(env: EnvSource = process.env): WebConfig {
  const apiInternalUrl = env.API_INTERNAL_URL;
  if (apiInternalUrl === undefined || apiInternalUrl.trim() === '') {
    throw new Error('API_INTERNAL_URL не задан — маршруты /c/{card_id} не могут обратиться к api');
  }
  return { apiInternalUrl };
}
