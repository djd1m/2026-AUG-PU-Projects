// ЕДИНСТВЕННОЕ место, где сервис `api` читает `process.env` (FR-foundation-2).
//
// Почему единственное: страж `scripts/check-env-wiring.sh` сверяет `process.env.X`
// в исходниках СЕРВИСА с блоком `environment:` этого сервиса в `docker compose config`.
// Чтение, размазанное по общим пакетам, приписало бы переменные ВСЕМ сервисам сразу и
// превратило стража в источник ложных потерь.
//
// Ни у одной переменной ниже нет значения по умолчанию, и это не забывчивость:
// подставленный `http://localhost:3000` однажды сделал нерабочей КАЖДУЮ выданную ссылку
// при полностью зелёных тестах (`silent-fallbacks`).

import {
  attempt,
  collectConfig,
  requireOrigin,
  requirePositiveInt,
  requireText,
  type ApiConfig,
} from '@n4/shared';

/** Источник значений. По умолчанию — окружение процесса; тест подставляет своё. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadApiConfig(env: EnvSource = process.env): ApiConfig {
  return collectConfig<ApiConfig>((fail) => ({
    databaseUrl: attempt(
      fail,
      () => requireText('DATABASE_URL', env.DATABASE_URL, 'без строки подключения не выдаётся ни одна сессия и не считается ни один потолок'),
      '',
    ),
    appOrigin: attempt(
      fail,
      () => requireOrigin('APP_ORIGIN', env.APP_ORIGIN, 'он определяет КАЖДУЮ выдаваемую наружу ссылку; с умолчанием все они повели бы на localhost'),
      '',
    ),
    storage: {
      endpoint: attempt(
        fail,
        () => requireText('S3_ENDPOINT', env.S3_ENDPOINT, 'без адреса бакета фото пользователя некуда положить'),
        '',
      ),
      bucket: attempt(
        fail,
        () => requireText('S3_BUCKET', env.S3_BUCKET, 'без имени бакета фото пользователя некуда положить'),
        '',
      ),
      accessKey: attempt(
        fail,
        () => requireText('S3_ACCESS_KEY', env.S3_ACCESS_KEY, 'отсутствующий секрет доступа к бакету — отказ, а не анонимный доступ'),
        '',
      ),
      secretKey: attempt(
        fail,
        () => requireText('S3_SECRET_KEY', env.S3_SECRET_KEY, 'отсутствующий секрет доступа к бакету — отказ, а не анонимный доступ'),
        '',
      ),
    },
    quota: {
      // ТРИ независимые проверки (ADR-007): проверка одной переменной зеленеет при
      // отсутствующей второй, поэтому объявлены все три и каждая валит старт сама.
      scanLimitUser: attempt(
        fail,
        () => requirePositiveInt('N4_SCAN_LIMIT_USER', env.N4_SCAN_LIMIT_USER, 'незаданный личный потолок означал бы неограниченные платные вызовы от одного посетителя'),
        0,
      ),
      scanLimitDay: attempt(
        fail,
        () => requirePositiveInt('N4_SCAN_LIMIT_DAY', env.N4_SCAN_LIMIT_DAY, 'незаданный суточный потолок означал бы счёт без верхней границы'),
        0,
      ),
      escalationLimitDay: attempt(
        fail,
        () => requirePositiveInt('N4_ESCALATION_LIMIT_DAY', env.N4_ESCALATION_LIMIT_DAY, 'незаданный потолок эскалаций означал бы, что дорогая модель ограничена только вдесятеро более слабым общим потолком'),
        0,
      ),
    },
    rateLimits: {
      // Числа канона §7 (DEC-A-013): 30 мутаций и 120 чтений в минуту на один ip_prefix.
      // Переменной они сделаны намеренно — предел, который нельзя подкрутить под машину,
      // однажды отключают целиком. Отсутствие значения валит старт наравне с потолками.
      mutatePerMinute: attempt(
        fail,
        () => requirePositiveInt('N4_RATE_LIMIT_MUTATE_PER_MIN', env.N4_RATE_LIMIT_MUTATE_PER_MIN, 'без порога мутирующие маршруты перебираются бесплатно, и ограничение частоты не существует'),
        0,
      ),
      readPerMinute: attempt(
        fail,
        () => requirePositiveInt('N4_RATE_LIMIT_READ_PER_MIN', env.N4_RATE_LIMIT_READ_PER_MIN, 'без порога чтение перебирается бесплатно, и ограничение частоты не существует'),
        0,
      ),
    },
  }));
}

/** Имена переменных, проверенных при старте. В журнал уходят ИМЕНА, значения — никогда. */
export const API_REQUIRED_VARIABLES: readonly string[] = [
  'DATABASE_URL',
  'APP_ORIGIN',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'N4_SCAN_LIMIT_USER',
  'N4_SCAN_LIMIT_DAY',
  'N4_ESCALATION_LIMIT_DAY',
  'N4_RATE_LIMIT_MUTATE_PER_MIN',
  'N4_RATE_LIMIT_READ_PER_MIN',
];
