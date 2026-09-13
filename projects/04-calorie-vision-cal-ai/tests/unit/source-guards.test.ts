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

  /**
   * RV-scan-pipeline-10: прежние два теста НЕ проверяли `provider/live.ts` — единственное
   * место, где схема реально уходит НАРУЖУ, в Anthropic API (`RESPONSE_SCHEMA`, JSON-schema
   * с обычными строковыми ключами, а не TS `readonly поле:` — второй тест выше находит
   * ТОЛЬКО объявления интерфейса и `live.ts` не читал вовсе). Бренд-запрещённые ИМЕНА как
   * КЛЮЧИ JSON-схемы, а не подстрокой (`model_estimate_kcal` содержит `kcal`, но это
   * РАЗРЕШЁННОЕ поле) — граница проведена `\b`, испытана мутацией НИЖЕ.
   */
  function findForbiddenSchemaKeys(code: string): string[] {
    const forbidden = /['"]?\b(kcal|calories|protein|fat|carbs|carb)\b['"]?\s*:/g;
    const found: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = forbidden.exec(code)) !== null) found.push(match[1] ?? '');
    return found;
  }

  it('производственная JSON-схема live.ts не содержит kcal/calories/protein/fat/carbs КАК КЛЮЧ (испытано мутацией)', async () => {
    const provider = await readAll('apps/recognizer/src/provider');
    const live = provider.find(({ file }) => file.endsWith('provider/live.ts'));
    expect(live).toBeDefined();

    // Зелёный на РЕАЛЬНОМ файле: разрешённое `model_estimate_kcal` не флагуется.
    expect(findForbiddenSchemaKeys(live?.code ?? '')).toEqual([]);

    // ИСПЫТАНИЕ СТРАЖА НА ВНЕДРЁННОМ ДЕФЕКТЕ (guard-must-be-able-to-fail.md): страж, ни
    // разу не показавший красное, стражем не является. Мутация — В ПАМЯТИ, файл на диске
    // не трогается.
    const mutatedAddingForbiddenField = (live?.code ?? '').replace(
      "model_estimate_kcal: { type: 'number' },",
      "model_estimate_kcal: { type: 'number' },\n    protein: { type: 'number' },",
    );
    expect(mutatedAddingForbiddenField).not.toBe(live?.code); // подтверждает, что замена реально произошла
    expect(findForbiddenSchemaKeys(mutatedAddingForbiddenField)).toEqual(['protein']);
  });

  /**
   * RV-scan-pipeline-10: «условие запрета done» — статус `done` пишется В recognize-scan.ts
   * ТОЛЬКО внутри ветки, охраняемой `anyMatched`. Проверяется ТЕКСТОВОЙ близостью (страж
   * слоя 1 — деревья разбирать не требуется, инвариант простой и локальный), с мутацией.
   */
  function doneGuardedByMatch(code: string): boolean {
    // Запятая после закрывающей кавычки отличает ПРИСВОЕНИЕ объекта (`status: 'done',`)
    // от объявления ТИПА union (`status: 'done' | 'failed' | 'refused';`, без запятой
    // сразу после — там точка с запятой И вертикальная черта).
    const index = code.indexOf("status: 'done',");
    if (index === -1) return true; // done нигде не пишется присвоением — условие выполнено вакуумно
    const before = code.slice(Math.max(0, index - 120), index);
    return /anyMatched\s*\?/.test(before);
  }

  it('recognize-scan.ts: статус done охраняется условием anyMatched (испытано мутацией)', async () => {
    const recognize = await readAll('apps/recognizer/src/recognize');
    const scanFile = recognize.find(({ file }) => file.endsWith('recognize-scan.ts'));
    expect(scanFile).toBeDefined();

    expect(doneGuardedByMatch(scanFile?.code ?? '')).toBe(true);

    // Мутация: убрать охрану — заменить тернарник на безусловное присвоение status:'done'.
    const mutatedRemovingGuard = (scanFile?.code ?? '').replace('anyMatched\n    ? {', 'true\n    ? {');
    expect(mutatedRemovingGuard).not.toBe(scanFile?.code);
    expect(doneGuardedByMatch(mutatedRemovingGuard)).toBe(false);
  });

  /**
   * RV-scan-pipeline-10: «единственное чтение оценки» — `modelEstimateKcal`/
   * `model_estimate_kcal` НИКОГДА не участвует в арифметике (не складывается, не умножается,
   * не входит в сравнение с другим числом калорий) — только читается и передаётся дальше.
   */
  it('modelEstimateKcal нигде не участвует в арифметике — только присваивается/передаётся', async () => {
    const arithmeticNear = /(modelEstimateKcal|model_estimate_kcal)\s*[-+*/]|[-+*/]\s*(modelEstimateKcal|model_estimate_kcal)/;
    const offenders: string[] = [];
    for (const { file, code } of [...(await readAll('apps/recognizer/src')), ...(await readAll('apps/api/src'))]) {
      for (const line of codeLines(code)) {
        if (arithmeticNear.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
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
