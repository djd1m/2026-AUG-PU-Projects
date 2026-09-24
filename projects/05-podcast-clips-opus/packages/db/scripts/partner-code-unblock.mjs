// docker compose --project-directory . --env-file .env exec web node packages/db/scripts/partner-code-unblock.mjs <код> "<причина>"
// Причину видит партнёр — не писать в неё данные чужих аккаунтов (адреса, IP).
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/** @param {import('pg').Pool} pool @param {string} code @param {string} reason @param {Date} now */
export async function unblockPartnerCode(pool, code, reason, now) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed || [...trimmed].length > 500) throw new Error('Причина обязательна: от 1 до 500 знаков');
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{6,12}$/.test(code)) throw new Error('Некорректный код');
  const result = await pool.query(`UPDATE partner_code
    SET status='active',blocked_reason=NULL,blocked_at=NULL,unblocked_at=$3,unblock_reason=$2
    WHERE code=$1 AND status='blocked' RETURNING code,unblocked_at,unblock_reason`, [code, trimmed, now]);
  if (!result.rowCount) throw new Error('Код не найден или не заблокирован');
  return result.rows[0];
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (!env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL не задан: проверка НЕ ВЫПОЛНЕНА');
    return 2;
  }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    if (args.length !== 2) throw new Error('Укажите код и обязательную причину в кавычках');
    await unblockPartnerCode(pool, args[0], args[1], new Date());
    console.log('Код разблокирован');
    return 0;
  } catch (error) {
    // Do not print driver errors: they can expose connection credentials.
    console.error(error instanceof Error && !('code' in error) &&
      /^(Причина|Некорректный код|Код не найден|Укажите код)/.test(error.message)
      ? error.message : 'Разблокировка не выполнена: проверьте доступность БД и миграции');
    return 1;
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
