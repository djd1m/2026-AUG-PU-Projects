// Отчёт метрик роста для оператора (FR-GROWTH-006): i, conv%, установки, просмотры демо-страницы — JSON в stdout.
// Экрана метрик в неделю нет; команда запускается в образе migrate, где есть packages/db/dist:
//   docker compose run --rm -e N6_PUBLIC_ORIGIN=https://… migrate node packages/db/dist/growth-report.js 7
// N6_PUBLIC_ORIGIN обязателен: по нему клики бейджа на демо-странице отделяются от кликов на сайтах клиентов (conv%).
// Коды: 0 — отчёт выведен; 2 — отчёт НЕ получен (нет DATABASE_URL или N6_PUBLIC_ORIGIN, непригодный период, БД недоступна).
import { createPool } from './pool.js';
import { growthMetrics } from './growth.js';

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  const days = Number(process.argv[2] ?? '7');
  let publicHost: string | null = null;
  try { publicHost = new URL(process.env.N6_PUBLIC_ORIGIN ?? '').hostname || null; } catch { publicHost = null; }
  if (!databaseUrl?.trim()) { console.error('DATABASE_URL не задан — отчёт метрик НЕ получен'); process.exit(2); }
  if (!publicHost) { console.error('N6_PUBLIC_ORIGIN не задан или непригоден — каналы бейджа не разделить, отчёт НЕ получен'); process.exit(2); }
  if (!Number.isInteger(days) || days < 1 || days > 366) { console.error('Период — целое число суток от 1 до 366'); process.exit(2); }
  const pool = createPool(databaseUrl);
  growthMetrics(pool, days, publicHost)
    .then((metrics) => { console.log(JSON.stringify(metrics, null, 2)); })
    .catch(() => { console.error('Отчёт метрик НЕ получен: БД недоступна или схема не мигрирована'); process.exitCode = 2; })
    .finally(() => pool.end());
}
