// Отчёт метрик роста для оператора (FR-GROWTH-006): i, conv%, установки, просмотры демо-страницы — JSON в stdout.
// Экрана метрик в неделю нет; команда запускается в образе migrate, где есть packages/db/dist:
//   docker compose run --rm migrate node packages/db/dist/growth-report.js 7
// Коды: 0 — отчёт выведен; 2 — отчёт НЕ получен (нет DATABASE_URL, непригодный период, БД недоступна).
import { createPool } from './pool.js';
import { growthMetrics } from './growth.js';

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  const days = Number(process.argv[2] ?? '7');
  if (!databaseUrl?.trim()) { console.error('DATABASE_URL не задан — отчёт метрик НЕ получен'); process.exit(2); }
  if (!Number.isInteger(days) || days < 1 || days > 366) { console.error('Период — целое число суток от 1 до 366'); process.exit(2); }
  const pool = createPool(databaseUrl);
  growthMetrics(pool, days)
    .then((metrics) => { console.log(JSON.stringify(metrics, null, 2)); })
    .catch(() => { console.error('Отчёт метрик НЕ получен: БД недоступна или схема не мигрирована'); process.exitCode = 2; })
    .finally(() => pool.end());
}
