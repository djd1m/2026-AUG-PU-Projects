import { createPool } from '@clipmaker/db';
import { pathToFileURL } from 'node:url';

// Работает и на новом volume, и на старом: initdb.d выполнялся бы лишь один раз.
export async function ensureTestDatabase(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL отсутствует: тестовая база не может быть подготовлена');
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^[a-z][a-z0-9_]*_test$/.test(name)) {
    throw new Error('Подготовка разрешена только для отдельной базы *_test');
  }
  url.pathname = '/postgres';
  const pool = createPool(url.href);
  try {
    if (!(await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) {
      try { await pool.query(`CREATE DATABASE "${name}"`); }
      catch (error) { if (error.code !== '42P04') throw error; } // параллельный тестовый запуск
    }
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureTestDatabase(process.env.DATABASE_URL).catch(() => {
    console.error('Тестовая база не подготовлена: нужны DATABASE_URL с именем *_test, доступная БД и право CREATE DATABASE');
    process.exitCode = 1;
  });
}
