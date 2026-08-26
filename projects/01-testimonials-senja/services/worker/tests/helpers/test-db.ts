/**
 * Хелпер интеграционных тестов (testing.md §1: "Integration ... с реальной тестовой
 * Postgres"). Создаёт МИНИМАЛЬНУЮ схему — только поля, которые реально читает/пишет
 * services/worker (Architecture §3, §3.4) — не полную миграцию из packages/db (она
 * собирается параллельным агентом в этом же прогоне, см. README.md "Почему прямой SQL").
 *
 * Все тесты, использующие этот хелпер, пропускаются (`describe.skipIf`), если
 * TEST_DATABASE_URL не задан — так тесты остаются зелёными в окружениях без Postgres,
 * но реально проверяют поведение SKIP LOCKED там, где Postgres доступен.
 */
import pg from "pg";

export function testDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL;
}

export async function createTestPool(): Promise<pg.Pool> {
  const url = testDatabaseUrl();
  if (!url) {
    throw new Error("TEST_DATABASE_URL не задан — вызывающий тест должен был это проверить");
  }
  return new pg.Pool({ connectionString: url, max: 10 });
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
  await pool.query(`DROP TABLE IF EXISTS testimonials;`);
  await pool.query(`DROP TABLE IF EXISTS rate_limit_events;`);
}
