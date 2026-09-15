// Общая оснастка тестов, которым нужен НАСТОЯЩИЙ PostgreSQL профиля `test`.
//
// Мок здесь не годится по существу: проверяются уникальный индекс, блокировки строк и
// поведение `ON CONFLICT` под конкуренцией — ровно то, чего у мока нет.

import { createPool, runMigrations, type DbPool } from '@n4/db';

/**
 * Имя базы, в которую интеграционным тестам РАЗРЕШЕНО писать. Закрытый список В КОДЕ, не в
 * окружении (`fail-closed-defaults.md`, правило 3): переменная окружения однажды приедет с
 * именем боевой базы, и список, живущий рядом с ней, этого не заметит.
 */
const ALLOWED_TEST_DATABASES: readonly string[] = ['n4_test'];

/**
 * Страж, заслуженный реальной потерей данных (DEC-A-051, 2026-09-13): `truncateAll` начинает
 * каждый файл тестов с TRUNCATE, профиль `test` смотрел в боевую базу стенда `n4`, и один
 * прогон стёр базу продуктов вместе с импортом USDA — 253 синонима и весь FoodData Central.
 *
 * Правка compose эту дыру закрывает, но правку можно откатить, перепутать или скопировать в
 * новый файл окружения. Проверка ИМЕНИ БАЗЫ здесь не откатывается вместе с ней: тест,
 * нацеленный не туда, не выполняется вовсе.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    // Отсутствие базы — это НЕ «тест прошёл»: он не выполнен, и об этом надо упасть.
    throw new Error('DATABASE_URL не задан: интеграционные тесты запускаются в профиле test docker compose');
  }
  assertTestDatabase(url);
  return url;
}

/** Отдельно экспортирована, чтобы страж можно было испытать, не поднимая базу. */
export function assertTestDatabase(url: string): void {
  let name: string;
  try {
    name = new URL(url).pathname.replace(/^\//, '');
  } catch {
    // Неразбираемый адрес — ОТКАЗ, а не «наверное, тестовая» (`honest-configuration` CFG-I4).
    throw new Error(`DATABASE_URL не разбирается как адрес — проверка целевой базы НЕ ВЫПОЛНЕНА, тесты не запускаются: ${url}`);
  }
  if (!ALLOWED_TEST_DATABASES.includes(name)) {
    throw new Error(
      `интеграционные тесты нацелены на базу «${name}», а разрешены только ${ALLOWED_TEST_DATABASES.join(', ')}. ` +
      'Они начинаются с TRUNCATE: один прогон по боевой базе стирает дневники, карточки и весь импорт USDA (DEC-A-051)',
    );
  }
}

export function appDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_APP;
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL_APP не задан: проверить права роли приложения из-под администратора невозможно');
  }
  return url;
}

let migrated = false;

/** Пул на схему, приведённую миграциями. Миграции применяются один раз за прогон. */
export async function migratedPool(applicationName = 'n4-tests'): Promise<DbPool> {
  const databaseUrl = requireDatabaseUrl();
  if (!migrated) {
    await runMigrations({ databaseUrl });
    migrated = true;
  }
  return createPool({ databaseUrl, applicationName, max: 10 });
}

/** Чистое состояние между файлами: данные, а не схема. */
export async function truncateAll(pool: DbPool): Promise<void> {
  await pool.query(`TRUNCATE
    growth_event, pro_interest, attribution, partner_code, partner,
    share_card, diary_entry, scan_quota_counter, recognition, photo,
    telegram_login_replay,
    food_synonym, food_item, device_session, account
    RESTART IDENTITY CASCADE`);
}

export interface SeededSession {
  readonly id: string;
}

/**
 * Кадр в бакете. Нужен тестам аренды: предикат выборки требует `photo_id IS NOT NULL`,
 * потому что незавершённая публикация обязана быть НЕВИДИМА воркеру.
 */
export async function seedPhoto(pool: DbPool, sessionId: string, marker: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on)
     VALUES ($1, $2, 'image/jpeg', 1024, 800, 600, current_date + 30) RETURNING id`,
    [sessionId, `photos/${marker}.jpg`],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('кадр не создан');
  return row.id;
}

/** Сессия устройства для тестов квоты и аренды. Токен здесь не нужен — только строка. */
export async function seedSession(pool: DbPool, marker: string): Promise<SeededSession> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
    [`hash-${marker}`, '203.0.113.0/24'],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('сессия не создана');
  return { id: row.id };
}
