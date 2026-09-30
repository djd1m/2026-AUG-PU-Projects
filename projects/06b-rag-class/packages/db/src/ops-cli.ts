// Команды оператора (веб-ручки нет — OWN-06B-010). Запуск в контейнере web, где есть DATABASE_URL_SERVICE и LIMIT_*:
//   node packages/db/dist/ops-cli.js reset-quota --scope <ключ> --operator <кто> [--day YYYY-MM-DD] [--reason <текст>]
//   node packages/db/dist/ops-cli.js spend-today
// Коды: 0 выполнено · 1 отказ (ключ, оператор, счётчика нет, конфигурация) · 2 команда не распознана.
// Значения секретов не печатаются никогда.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig, ConfigError, type VarSpec } from './boot-config.js';
import { createPool } from './pool.js';
import { moscowDay } from './quota.js';
import { resetQuota, ResetRefused } from './quota-admin.js';
import { LIMIT_VARIABLES, limitsFrom } from './quota-keys.js';
import { spendToday } from './spend-today.js';

const CONNECTION: VarSpec = { name: 'DATABASE_URL_SERVICE', kind: 'pg-url', user: 'n6b_app_service',
  consequence: 'команда оператора не может обратиться к БД' };

export function parseFlags(args: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new ResetRefused(`аргумент ${key ?? '?'} без значения`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

export async function runOps(argv: readonly string[], env: Readonly<Record<string, string | undefined>>,
  out: (line: string) => void, err: (line: string) => void): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'reset-quota' && command !== 'spend-today') {
    err('команды: reset-quota --scope <ключ> --operator <кто> [--day YYYY-MM-DD] [--reason <текст>] | spend-today');
    return 2;
  }
  let pool;
  try {
    const url = checkConfig([CONNECTION], [], env, false).DATABASE_URL_SERVICE as string;
    pool = createPool(url, CONNECTION.name);
    if (command === 'reset-quota') {
      const flags = parseFlags(rest);
      const day = flags.day ?? moscowDay();
      const previous = await resetQuota(pool, { scope: flags.scope ?? '', day, operator: flags.operator ?? '',
        reason: flags.reason });
      out(`сброшено: ${flags.scope} за ${day}, было ${previous}; запись в quota_reset_log`);
      return 0;
    }
    const specs = Object.values(LIMIT_VARIABLES).map((name): VarSpec => ({ name, kind: 'limit',
      consequence: 'сводка не может сравнить расход с потолком' }));
    const limits = limitsFrom(checkConfig(specs, [], env, false));
    out(JSON.stringify(await spendToday(pool, limits), null, 2));
    return 0;
  } catch (error) {
    if (error instanceof ResetRefused || error instanceof ConfigError) {
      err(`отказ: ${error.message}`);
      return 1;
    }
    err(`отказ: ${(error as Error).name} — БД недоступна или запрос не выполнен`);
    return 1;
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  runOps(process.argv.slice(2), process.env, (l) => console.log(l), (l) => console.error(l))
    .then((code) => { process.exitCode = code; });
}
