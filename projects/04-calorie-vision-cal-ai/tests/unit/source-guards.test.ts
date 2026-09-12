// Стражи по ИСХОДНИКУ: они стерегут свойство КОДА, а не поведение одного прогона
// (AC-foundation-16, ADR-001, NFR-foundation-1).
//
// Почему не ревью: ревьюер поймает один случай и пропустит соседний в том же merge.
// Каждый страж ниже испытан на внедрённом дефекте — обе строки в квитанции Phase 3.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function sourceFiles(relative: string): Promise<string[]> {
  const base = path.join(ROOT, relative);
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
    }
  };
  await walk(base);
  return found;
}

async function readAll(relative: string): Promise<{ file: string; code: string }[]> {
  const files = await sourceFiles(relative);
  return Promise.all(files.map(async (file) => ({ file: path.relative(ROOT, file), code: await readFile(file, 'utf8') })));
}

/** Строки кода без комментариев: комментарий — не вызов и не чтение. */
function codeLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

describe('страж гигиены журнала', () => {
  it('в вызовы журналирования не передаются секреты и полный адрес', async () => {
    // Запрещённые ИМЕНА значений: если такое имя стоит в аргументах logger.*, значит в
    // журнал уезжает то, чего там быть не должно, — независимо от того, как названо поле.
    const forbidden = /\b(issuedToken|presentedToken|cookie_token|cookieToken|rawToken|anthropicApiKey|apiKey|secretKey|accessKey|botToken|TELEGRAM_BOT_TOKEN|fullAddress)\b/;
    const offenders: string[] = [];

    for (const { file, code } of [...(await readAll('apps/api/src')), ...(await readAll('apps/recognizer/src'))]) {
      for (const line of codeLines(code)) {
        if (!/\blogger\.(debug|info|warn|error)\(/.test(line) && !/\blog\.(debug|info|warn|error)\(/.test(line)) continue;
        if (forbidden.test(line)) offenders.push(`${file}: ${line.trim()}`);
        // Полный адрес: в журнал уходит только усечённый префикс.
        if (/\b(request\.ip|clientAddressFrom\()/.test(line)) offenders.push(`${file}: полный адрес в журнале — ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('страж единственного экземпляра разделяемых ресурсов', () => {
  it('пул и ограничитель частоты создаются один раз при старте процесса', async () => {
    const files = [...(await readAll('apps/api/src')), ...(await readAll('apps/recognizer/src'))];

    const poolCreators = files.filter(({ code }) => codeLines(code).some((line) => /\bcreatePool\(/.test(line))).map(({ file }) => file);
    // Пул создаётся ТОЛЬКО в загрузчике сервиса. Создание внутри обработчика запроса
    // означало бы новый пул на каждый запрос — то есть отсутствие пула.
    expect(poolCreators.sort()).toEqual(['apps/api/src/bootstrap.ts', 'apps/recognizer/src/bootstrap.ts']);

    const limiterCreators = files.filter(({ code }) => codeLines(code).some((line) => /\bcreateRateLimiter\(/.test(line))).map(({ file }) => file);
    expect(limiterCreators.sort()).toEqual(['apps/api/src/http/rate-limit.ts', 'apps/api/src/server.ts']);

    // И главное: ни одного создания ВНУТРИ обработчика маршрута или хука.
    for (const { file, code } of files) {
      const lines = code.split('\n');
      lines.forEach((line, index) => {
        if (!/\b(createPool|createRateLimiter)\(/.test(line)) return;
        const context = lines.slice(Math.max(0, index - 12), index).join('\n');
        expect(/app\.(get|post|put|patch|delete)\(|addHook\(/.test(context), `${file}:${index + 1}`).toBe(false);
      });
    }
  });
});

describe('страж живучести при недоступной базе', () => {
  it('каждый пул имеет обработчик события error и процесс переживает обрыв', async () => {
    // Заслужено живым стендом: остановка `db` на 10 секунд убивала процесс `api` целиком,
    // потому что событие 'error' простаивающего клиента пула никто не слушал. Падение
    // вместо ответа стирает разницу между «база недоступна» и «сервиса нет».
    for (const file of ['apps/api/src/bootstrap.ts', 'apps/recognizer/src/bootstrap.ts']) {
      const sources = await readAll(path.dirname(file));
      const bootstrap = sources.find((entry) => entry.file === file);
      expect(bootstrap, file).toBeDefined();
      expect(codeLines(bootstrap?.code ?? '').join('\n'), file).toMatch(/pool\.on\('error'/);
    }
  });
});

describe('страж ADR-001: число берётся из базы, а не из ответа модели', () => {
  it('в apps/recognizer нет чтения калорийности и БЖУ из ответа модели', async () => {
    // Проверяется именно ЭТО МНОЖЕСТВО имён, а не «нет слова kcal»: иначе страж
    // запретил бы и разрешённое поле model_estimate_kcal.
    const forbidden = /\b(calories|kcalPer100g|kcal_per_100g|proteinPer100g|protein_per_100g|fatPer100g|fat_per_100g|carbPer100g|carb_per_100g|dbKcalTotal|db_kcal_total)\b/;
    const offenders: string[] = [];

    for (const { file, code } of await readAll('apps/recognizer/src')) {
      for (const line of codeLines(code)) {
        if (forbidden.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('в объявленной схеме ответа модели нет ни одного поля о калорийности кроме разрешённого', async () => {
    // Схема ПЕРЕДАЁТСЯ параметром и объявлена одним значением — поэтому страж читает одно
    // место, а не ищет схему по всем реализациям порта. Проверяется именно МНОЖЕСТВО имён,
    // а не «нет слова kcal»: иначе страж запретил бы и разрешённое model_estimate_kcal.
    const { MODEL_RESPONSE_SCHEMA } = await import('../../apps/recognizer/src/provider/types.js');
    const forbidden = ['calories', 'kcal', 'protein', 'fat', 'carbs'];
    for (const field of MODEL_RESPONSE_SCHEMA.fields) {
      expect(forbidden, field).not.toContain(field);
    }
    expect(MODEL_RESPONSE_SCHEMA.fields.filter((f) => /kcal|calor|protein|fat|carb/i.test(f))).toEqual(['model_estimate_kcal']);
  });

  it('единственное поле о калорийности в ответе модели — model_estimate_kcal', async () => {
    const provider = await readAll('apps/recognizer/src/provider');
    const responseShape = provider.find(({ file }) => file.endsWith('types.ts'));
    expect(responseShape).toBeDefined();
    const declared = codeLines(responseShape?.code ?? '')
      .filter((line) => /^\s+readonly [a-zA-Z]+:/.test(line))
      .map((line) => line.trim().split(':')[0]?.replace('readonly ', '') ?? '');
    expect(declared).toContain('modelEstimateKcal');
    expect(declared.filter((name) => /kcal|calor|protein|fat|carb/i.test(name))).toEqual(['modelEstimateKcal']);
  });
});

describe('страж чтения окружения', () => {
  it('переменные окружения читает только по одному файлу на сервис', async () => {
    const readers: string[] = [];
    for (const relative of ['apps/api/src', 'apps/recognizer/src', 'apps/web', 'packages/shared/src', 'packages/db/src']) {
      for (const { file, code } of await readAll(relative)) {
        if (codeLines(code).some((line) => /process\.env/.test(line))) readers.push(file);
      }
    }
    // `packages/db/src/migrate.ts` — НАЗВАННОЕ исключение: у раннера есть собственная точка
    // входа из командной строки, и она обязана прочитать DATABASE_URL. Это не сервис
    // compose, и страж проброса переменных его каталог не смотрит.
    expect(readers.sort()).toEqual(['apps/api/src/env.ts', 'apps/recognizer/src/env.ts', 'packages/db/src/migrate.ts']);
  });
});
