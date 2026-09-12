// Общая оснастка тестов, которым нужен НАСТОЯЩИЙ PostgreSQL профиля `test`.
//
// Мок здесь не годится по существу: проверяются уникальный индекс, блокировки строк и
// поведение `ON CONFLICT` под конкуренцией — ровно то, чего у мока нет.

import { createPool, runMigrations, type DbPool } from '@n4/db';

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    // Отсутствие базы — это НЕ «тест прошёл»: он не выполнен, и об этом надо упасть.
    throw new Error('DATABASE_URL не задан: интеграционные тесты запускаются в профиле test docker compose');
  }
  return url;
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
