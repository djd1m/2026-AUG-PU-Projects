// Миграции на НАСТОЯЩЕМ PostgreSQL (AC-foundation-4).
//
// Каждый прогон создаёт СВОЮ базу и удаляет её: «14 таблиц созданы» на базе, где они уже
// были, доказывает только то, что их кто-то когда-то создал.

import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { MIGRATIONS_DIRECTORY, runMigrations } from '@n4/db';
import { requireDatabaseUrl } from '../helpers/db.js';

const CANON_TABLES = [
  'account', 'device_session', 'photo', 'recognition', 'food_item', 'food_synonym',
  'diary_entry', 'share_card', 'partner', 'partner_code', 'attribution',
  'scan_quota_counter', 'pro_interest', 'growth_event',
];

const scratchName = `n4_migrations_${Date.now()}`;
let scratchUrl = '';
let admin: pg.Client;

async function connectScratch(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: scratchUrl });
  await client.connect();
  return client;
}

beforeAll(async () => {
  const base = requireDatabaseUrl();
  admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${scratchName}`);
  const url = new URL(base);
  url.pathname = `/${scratchName}`;
  scratchUrl = url.toString();
  // Роли — объекты кластера, они уже существуют; отдельной базе нужны только гранты.
  const scratch = await connectScratch();
  await scratch.query('GRANT CREATE, TEMPORARY ON DATABASE ' + scratchName + ' TO n4_migrate');
  await scratch.query('ALTER SCHEMA public OWNER TO n4_migrate');
  await scratch.end();
}, 60_000);

afterAll(async () => {
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe('миграции', () => {
  it('миграции создают четырнадцать таблиц канона и расширение pg_trgm', async () => {
    const result = await runMigrations({ databaseUrl: scratchUrl });
    expect(result.applied).toContain('001_init.sql');

    const client = await connectScratch();
    try {
      const tables = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
      );
      const names = tables.rows.map((row) => row.table_name);
      for (const table of CANON_TABLES) expect(names, table).toContain(table);
      // Ровно 14 сущностей канона плюс журнал самих миграций — и ничего сверх.
      expect(names.sort()).toEqual([...CANON_TABLES, 'schema_migration'].sort());

      const extension = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
      expect(extension.rowCount).toBe(1);

      // Уникальности, названные критерием приёмки.
      const constraints = await client.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
      );
      const definitions = constraints.rows.map((row) => row.definition);
      expect(definitions).toContain('UNIQUE (scope, scope_key, day)');
      expect(definitions).toContain('UNIQUE (device_session_id, idempotency_key)');
      expect(definitions).toContain('UNIQUE (device_session_id)');
      expect(definitions).toContain('UNIQUE (code)');
      expect(definitions).toContain('UNIQUE (source, source_id)');

      // Частичный индекс очереди: без него выборка задания читает таблицу целиком.
      const indexes = await client.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'");
      const queueIndex = indexes.rows.map((row) => row.indexdef).find((def) => def.includes('recognition_queue_idx'));
      expect(queueIndex).toMatch(/\(status, leased_until\)/);
      expect(queueIndex).toMatch(/WHERE \(?status = 'queued'/);

      // Закрытые перечисления: ровно столько значений, сколько в каноне.
      const counts = await client.query<{ typname: string; values: number }>(
        `SELECT t.typname, count(*)::int AS values FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`,
      );
      const byName = new Map(counts.rows.map((row) => [row.typname, row.values]));
      expect(byName.get('recognition_status')).toBe(4);
      expect(byName.get('quota_scope')).toBe(3);
      expect(byName.get('attribution_status')).toBe(3);
      expect(byName.get('attribution_source')).toBe(3);
      expect(byName.get('growth_event_type')).toBe(5);
      expect(byName.get('photo_file_state')).toBe(2);
      expect(byName.get('account_status')).toBe(3);
    } finally {
      await client.end();
    }
  });

  it('повторный прогон миграций применяет ноль файлов', async () => {
    const result = await runMigrations({ databaseUrl: scratchUrl });
    expect(result.applied).toEqual([]);
    expect(result.skipped).toContain('001_init.sql');
  });

  it('вторая строка scan_quota_counter с тем же ключом отбивается базой', async () => {
    const client = await connectScratch();
    try {
      const insert = `INSERT INTO scan_quota_counter (scope, scope_key, day, used, "limit")
                      VALUES ('global', 'all', current_date, 1, 3000)`;
      await client.query(insert);
      // Единственность обеспечивает БАЗА, а не код: без ограничения два процесса завели бы
      // два счётчика на один ключ и оба остались бы ниже потолка.
      await expect(client.query(insert)).rejects.toMatchObject({ code: '23505' });
    } finally {
      await client.end();
    }
  });

  it('изменённый после применения файл миграции валит раннер', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'n4-migrations-'));
    await cp(MIGRATIONS_DIRECTORY, directory, { recursive: true });

    const second = `n4_checksum_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${second}`);
    const url = new URL(requireDatabaseUrl());
    url.pathname = `/${second}`;
    const secondUrl = url.toString();
    const prep = new pg.Client({ connectionString: secondUrl });
    await prep.connect();
    await prep.query(`GRANT CREATE, TEMPORARY ON DATABASE ${second} TO n4_migrate`);
    await prep.query('ALTER SCHEMA public OWNER TO n4_migrate');
    await prep.end();

    try {
      await runMigrations({ databaseUrl: secondUrl, directory });

      const file = path.join(directory, '001_init.sql');
      const original = await readFile(file, 'utf8');
      await writeFile(file, `${original}\n-- правка после применения\n`, 'utf8');

      // Молчаливое переприменение запрещено: схема и журнал разошлись бы без следа.
      await expect(runMigrations({ databaseUrl: secondUrl, directory })).rejects.toThrow(/изменён после применения/);
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${second} WITH (FORCE)`);
    }
  }, 60_000);
});
