/**
 * Хелпер интеграционных тестов (testing.md §1: "Integration ... с реальной тестовой
 * Postgres"). Создаёт МИНИМАЛЬНУЮ схему — только поля, которые реально читает/пишет
 * services/worker (Architecture §3, §3.4) — не полную миграцию из packages/db.
 *
 * Все тесты, использующие этот хелпер, пропускаются (`describe.skipIf`), если
 * TEST_DATABASE_URL не задан — так тесты остаются зелёными в окружениях без Postgres,
 * но реально проверяют поведение SKIP LOCKED там, где Postgres доступен.
 *
 * ИЗОЛЯЦИЯ ЧЕРЕЗ ОТДЕЛЬНУЮ СХЕМУ POSTGRES (D-008, Phase 3 /start).
 * Раньше хелпер создавал `testimonials`/`rate_limit_events` прямо в `public` той же тестовой
 * БД, что и `packages/db`, а в `afterAll` делал `DROP TABLE`. Два следствия, оба реальные:
 *
 *   1. `npm test` был НЕИДЕМПОТЕНТЕН — прогон worker сносил таблицы, и следующий прогон
 *      `packages/db` падал на 18 тестах с `relation "rate_limit_events" does not exist`,
 *      хотя `schema_migrations` считала миграцию 006 применённой. Схема и журнал миграций
 *      расходились молча.
 *   2. `CREATE TABLE IF NOT EXISTS testimonials` с УРЕЗАННЫМ набором колонок мог отработать
 *      раньше миграции 003 — и тогда 003 тихо пропустила бы создание настоящей таблицы,
 *      оставив схему без `project_id`, `status`, `author_name`.
 *
 * Причина исходного решения зафиксирована честно: worker писался параллельным агентом до
 * того, как `packages/db` существовал (класс дефекта PR-005 — расхождение параллельных
 * агентов). Право иметь свою минимальную схему за worker сохранено — убрана только общая
 * площадка: теперь она живёт в схеме `worker_test`, физически недосягаемой для миграций.
 */
import pg from "pg";

/** Отдельная схема Postgres — граница структурная, а не по договорённости. */
const TEST_SCHEMA = "worker_test";

export function testDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL;
}

export async function createTestPool(): Promise<pg.Pool> {
  const url = testDatabaseUrl();
  if (!url) {
    throw new Error("TEST_DATABASE_URL не задан — вызывающий тест должен был это проверить");
  }

  // Схему заводим отдельным соединением ДО пула: иначе search_path укажет в никуда.
  const bootstrap = new pg.Client({ connectionString: url });
  await bootstrap.connect();
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  await bootstrap.end();

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // search_path выставляется на КАЖДОЕ новое соединение пула: пул открывает их лениво,
  // разово выставленный путь достался бы только первому. pg сохраняет порядок запросов
  // в пределах соединения, поэтому SET гарантированно выполнится раньше запросов теста.
  pool.on("connect", (client) => {
    void client.query(`SET search_path TO ${TEST_SCHEMA}`);
  });
  return pool;
}

export async function setupSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      video_object_key text NOT NULL,
      transcript text,
      transcript_source text NOT NULL DEFAULT 'machine',
      transcript_status text NOT NULL DEFAULT 'pending'
        CHECK (transcript_status IN ('pending', 'completed', 'failed')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id bigserial PRIMARY KEY,
      scope text NOT NULL,
      key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  // pgcrypto для gen_random_uuid() — часть стандартного образа postgres:16, но на
  // некоторых сборках требует явного включения расширения.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`).catch(() => {
    // если расширение недоступно (нет прав), тесты передают id явно — не критично
  });
}

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(`TRUNCATE testimonials, rate_limit_events;`);
}

export async function dropSchema(pool: pg.Pool): Promise<void> {
  // CASCADE по СХЕМЕ, а не по таблицам: снести можно только то, что тест сам и создал.
  // Таблицы `public` (настоящие миграции packages/db) этой командой недостижимы.
  await pool.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
}
