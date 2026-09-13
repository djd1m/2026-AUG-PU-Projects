// Стражи по ИСХОДНИКУ: они стерегут свойство КОДА, а не поведение одного прогона
// (AC-foundation-16, ADR-001, NFR-foundation-1).
//
// Почему не ревью: ревьюер поймает один случай и пропустит соседний в том же merge.
// Каждый страж ниже испытан на внедрённом дефекте — обе строки в квитанции Phase 3.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SERVICE_LOG_FIELDS } from '@n4/shared';

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

/**
 * Вызовы журналирования ЦЕЛИКОМ, от `logger.info(` до закрывающей скобки. Аргументы
 * занимают несколько строк, и однострочная проверка пропускает почти всё интересное.
 */
function loggerCalls(source: string): string[] {
  const lines = codeLines(source);
  const calls: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!/\b(logger|log)\.(debug|info|warn|error)\(/.test(line)) continue;
    let call = line;
    let depth = (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
    let cursor = index;
    while (depth > 0 && cursor + 1 < lines.length) {
      cursor += 1;
      const next = lines[cursor] ?? '';
      call += `\n${next}`;
      depth += (next.match(/\(/g) ?? []).length - (next.match(/\)/g) ?? []).length;
    }
    calls.push(call);
  }
  return calls;
}

/**
 * Имена переменных, ПРОИЗВЕДЁННЫХ от строки запроса: `const path = request.url…`,
 * `let p; p = req.url…`, а также присваивания из уже произведённой переменной.
 * Нужны потому, что прямой запрет `request.url` в вызове журналирования обходится
 * переносом выражения на строку выше — и именно так дефект и вернулся.
 */
function derivedFromUrl(source: string): string[] {
  const lines = codeLines(source);
  const names = new Set<string>();
  // Два прохода: второй ловит цепочку `const a = request.url; const b = a.slice(1)`.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const line of lines) {
      const assignment = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/.exec(line) ?? /^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)$/.exec(line);
      if (assignment === null) continue;
      const [, name, expression] = assignment;
      if (name === undefined || expression === undefined) continue;
      const fromUrl = /\b(request|req)\.url\b/.test(expression);
      const fromDerived = [...names].some((known) => new RegExp(`\\b${known}\\b`).test(expression));
      if (fromUrl || fromDerived) names.add(name);
    }
  }
  return [...names];
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
      // Вызов журналирования читается ЦЕЛИКОМ, а не построчно: аргументы почти всегда
      // занимают несколько строк, и однострочный страж пропустил бы ровно тот случай,
      // которым дефект и был предъявлен (RV-foundation-01) — `request.url` стоял строкой
      // ниже имени `logger.error`.
      for (const call of loggerCalls(code)) {
        if (forbidden.test(call)) offenders.push(`${file}: ${call.replace(/\s+/g, ' ').trim()}`);
        // Полный адрес: в журнал уходит только усечённый префикс.
        if (/\b(request\.ip|clientAddressFrom\()/.test(call)) offenders.push(`${file}: полный адрес в журнале — ${call.replace(/\s+/g, ' ').trim()}`);
        // Строка запроса ЦЕЛИКОМ: `request.url` несёт и query, и СЕГМЕНТЫ ПУТИ, а их пишет
        // тот же клиент. Поле называлось разрешённым словом `route`, а содержало ввод.
        if (/\b(request|req)\.url\b/.test(call)) offenders.push(`${file}: строка запроса в журнале — ${call.replace(/\s+/g, ' ').trim()}`);
        // И ЧЕРЕЗ ПРОМЕЖУТОЧНУЮ ПЕРЕМЕННУЮ ТОЖЕ. Прямой запрет обходится одной строкой выше
        // вызова (`const path = request.url.split('?')[0]`), и ровно этим обходом дефект
        // вернулся во второй раз. Страж, который ловит только прямую форму, учит писать
        // непрямую.
        for (const name of derivedFromUrl(code)) {
          if (new RegExp(`\\b${name}\\b`).test(call)) {
            offenders.push(`${file}: путь через переменную ${name} в журнале — ${call.replace(/\s+/g, ' ').trim()}`);
          }
        }
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

/**
 * Имена полей ВЕРХНЕГО уровня объекта-аргумента вызова журналирования. Разбор
 * с учётом вложенности: значение вида `a === undefined ? null : b` содержит двоеточие,
 * и наивный поиск `слово:` принял бы `null` за имя поля.
 */
function loggedFieldNames(call: string): string[] {
  const start = call.indexOf('{');
  if (start === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < call.length; i += 1) {
    const ch = call[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];
  const body = call.slice(start + 1, end);
  const parts: string[] = [];
  let level = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') level += 1;
    if (ch === '}' || ch === ']' || ch === ')') level -= 1;
    if (ch === ',' && level === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  const names: string[] = [];
  for (const part of parts) {
    const match = /^\s*([a-z_][a-z0-9_]*)\s*:/.exec(part);
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

describe('страж закрытого списка полей журнала', () => {
  it('каждое поле, передаваемое в журнал, объявлено в SERVICE_LOG_FIELDS', async () => {
    // Заслужено СЛИЯНИЕМ `consent-and-telegram-auth` в основную ветку. Закрытый список
    // появился в `foundation` ПОСЛЕ того, как ветка ответвилась, поэтому ни одно поле её
    // событий в нём не значилось — и после слияния каждое событие входа, согласия и эразуры
    // печаталось как `account_id: "[redacted]"`. Ни один тест обеих фич этого не показывал:
    // список и код никто не сверял, потому что сверять их было нечем.
    //
    // Отказ здесь — НЕ «не логируй это»: это требование внести поле в список ОСОЗНАННО,
    // то есть ровно то, ради чего список закрытый.
    const allowed = new Set(SERVICE_LOG_FIELDS);
    const offenders: string[] = [];
    for (const { file, code } of [...(await readAll('apps/api/src')), ...(await readAll('apps/recognizer/src'))]) {
      for (const call of loggerCalls(code)) {
        for (const name of loggedFieldNames(call)) {
          if (!allowed.has(name)) offenders.push(`${file}: поле '${name}' не объявлено в SERVICE_LOG_FIELDS`);
        }
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
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
