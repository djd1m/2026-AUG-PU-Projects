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
  it('в apps/recognizer нет чтения калорийности и БЖУ из ОТВЕТА МОДЕЛИ', async () => {
    // ПЕРЕСМОТРЕНО фичей `source-and-correct`: до неё `apps/recognizer` не содержал ни
    // одного упоминания `kcal_per_100g`/`protein_per_100g`/`fat_per_100g`/`carb_per_100g`
    // вовсе (сопоставление стояло за заглушкой), и блок-запрет на эти ИМЕНА был грубым, но
    // случайно верным приближением «нет чтения из модели». Теперь эти же имена — ЗАКОННЫЙ
    // источник числа (`food_item`/`Snapshot`, ИМЕННО то, что требует ADR-001) и читаются в
    // `match/usda-match-port.ts`, `match/expand-recipe-parts.ts`, `compute/from-snapshot.ts`,
    // `lease.ts` (`db_kcal_total` — колонка `recognition`, не поле ответа модели).
    // Запрет сужен до `calories` — имени, которое НИКОГДА не легитимно ни в одной форме
    // (ни в снимке базы: там `kcal_per_100g`, ни в модели: там `model_estimate_kcal`).
    // Точная граница «модель vs снимок» проверяется тремя другими тестами этого же
    // describe (объявленная схема, форма `ModelResponse`, JSON-схема `live.ts`) — они не
    // сузились и по-прежнему запрещают `kcal`/`protein`/`fat`/`carbs` КАК ПОЛЕ МОДЕЛИ.
    // Отдельно: страж `tests/guard/single-model-estimate-read.test.ts`
    // (AC-source-and-correct-13/24) утверждает единственное АРИФМЕТИЧЕСКОЕ чтение
    // `model_estimate_kcal` и что источником kcal/protein/fat/carb ЯВЛЯЕТСЯ `source_snapshot`.
    const forbidden = /\bcalories\b/;
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
   * RV-scan-pipeline-10, ПЕРЕСМОТРЕНО `source-and-correct` (ADR-001 Confirmation (2),
   * `terminalStatusForMatch`): статус `done` пишется В recognize-scan.ts ТОЛЬКО внутри
   * ветки, охраняемой `anyMatched` — НАПРЯМУЮ (прежняя форма) либо ЧЕРЕЗ
   * `terminal.status === 'done'`, где `terminal = terminalStatusForMatch(anyMatched)`.
   * Косвенная форма принимается ТОЛЬКО если сама `terminalStatusForMatch` фактически
   * фейл-клоузед по своему аргументу (иначе охрана через `terminal` — обещание без
   * содержания). Обе половины испытаны мутацией НИЖЕ.
   */
  function doneGuardedByMatch(recognizeCode: string, terminalStatusCode: string): boolean {
    // Запятая после закрывающей кавычки отличает ПРИСВОЕНИЕ объекта (`status: 'done',`)
    // от объявления ТИПА union (`status: 'done' | 'failed' | 'refused';`, без запятой
    // сразу после — там точка с запятой И вертикальная черта).
    const index = recognizeCode.indexOf("status: 'done',");
    if (index === -1) return true; // done нигде не пишется присвоением — условие выполнено вакуумно
    const nearBefore = recognizeCode.slice(Math.max(0, index - 120), index);
    if (/anyMatched\s*\?/.test(nearBefore)) return true;

    const before = recognizeCode.slice(0, index);
    const viaTerminal = before.includes("terminal.status === 'done'") && before.includes('terminalStatusForMatch(anyMatched)');
    if (!viaTerminal) return false;

    const flat = terminalStatusCode.replace(/\s+/g, ' ');
    return /if\s*\(\s*!anyMatched\s*\)/.test(flat) || /if\s*\(\s*anyMatched\s*\)/.test(flat);
  }

  it('recognize-scan.ts: статус done охраняется условием anyMatched — напрямую либо через terminalStatusForMatch (испытано мутацией)', async () => {
    const recognize = await readAll('apps/recognizer/src/recognize');
    const scanFile = recognize.find(({ file }) => file.endsWith('recognize-scan.ts'));
    expect(scanFile).toBeDefined();
    const compute = await readAll('apps/recognizer/src/compute');
    const terminalFile = compute.find(({ file }) => file.endsWith('terminal-status.ts'));
    expect(terminalFile).toBeDefined();

    expect(doneGuardedByMatch(scanFile?.code ?? '', terminalFile?.code ?? '')).toBe(true);

    // Мутация 1: подменить условие в recognize-scan.ts на всегда-истинное.
    const mutatedCondition = (scanFile?.code ?? '').replace("terminal.status === 'done'", "'done' === 'done'");
    expect(mutatedCondition).not.toBe(scanFile?.code);
    expect(doneGuardedByMatch(mutatedCondition, terminalFile?.code ?? '')).toBe(false);

    // Мутация 2: сама terminalStatusForMatch перестаёт быть фейл-клоузед (всегда 'done').
    const mutatedTerminal = (terminalFile?.code ?? '').replace('if (!anyMatched)', 'if (false)');
    expect(mutatedTerminal).not.toBe(terminalFile?.code);
    expect(doneGuardedByMatch(scanFile?.code ?? '', mutatedTerminal)).toBe(false);
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

describe('страж ADR-005: строка openfoodfacts не встречается ни в коде, ни в окружении', () => {
  // NFR-source-and-correct-3, ADR-005 Confirmation. Источник продукта — USDA FoodData
  // Central (CC0); Open Food Facts НЕ используется этой фичей ни как зависимость, ни как
  // упоминание — совпадение имени с конкурирующей базой было бы способом тихо перепутать
  // источник данных с источником атрибуции.
  async function findOpenFoodFacts(dirs: readonly string[], extraFiles: readonly string[]): Promise<string[]> {
    const offenders: string[] = [];
    for (const relative of dirs) {
      for (const { file, code } of await readAll(relative)) {
        if (/openfoodfacts/i.test(code)) offenders.push(file);
      }
    }
    for (const relative of extraFiles) {
      const full = path.join(ROOT, relative);
      try {
        const code = await readFile(full, 'utf8');
        if (/openfoodfacts/i.test(code)) offenders.push(relative);
      } catch {
        // Файла нет — нечего проверять, а не «нарушений не найдено» молча.
      }
    }
    return offenders;
  }

  const SCOPE_DIRS = ['apps/api/src', 'apps/recognizer/src', 'apps/web', 'packages/shared/src', 'packages/db/src', 'scripts'];
  const SCOPE_FILES = ['docker-compose.yml', '.env.example'];

  it('на РЕАЛЬНОМ коде и в docker-compose.yml/.env.example — ноль вхождений', async () => {
    expect(await findOpenFoodFacts(SCOPE_DIRS, SCOPE_FILES)).toEqual([]);
  });

  it('ИСПЫТАНИЕ СТРАЖА: внедрённое вхождение в исходник красит тест', async () => {
    // Мутация — В ПАМЯТИ: добавить упоминание запрещённой строки в код, который страж
    // читает, и подтвердить, что offenders перестаёт быть пустым.
    const files = await readAll('apps/recognizer/src');
    const mutated = files.map((entry, index) => (index === 0 ? { ...entry, code: `${entry.code}\n// см. openfoodfacts.org\n` } : entry));
    expect(mutated).not.toEqual(files);
    const offenders = mutated.filter(({ code }) => /openfoodfacts/i.test(code)).map(({ file }) => file);
    expect(offenders.length).toBe(1); // КРАСНЫЙ на мутированном наборе

    // Восстановление (немутированный набор) — снова ЗЕЛЁНЫЙ.
    expect(files.filter(({ code }) => /openfoodfacts/i.test(code))).toEqual([]);
  });
});

describe('страж RV-source-and-correct-05: SELECT_FOR_CORRECT держит блокировку строки', () => {
  // Дополняет ЖИВЫЕ конкурентные тесты (`tests/concurrency/source/concurrent-correct.test.ts`)
  // ДЕШЁВОЙ статической половиной: «показать падение при снятой защите»
  // (`guard-must-be-able-to-fail.md`) для целого прогона стенда стоило бы времени; здесь —
  // мгновенная проверка, что защитное `FOR UPDATE` физически присутствует в запросе, от
  // которого зависит сериализация `correct` против конкурентной записи воркера.
  it('запрос SELECT_FOR_CORRECT в scans-correct.ts несёт FOR UPDATE', async () => {
    const files = await readAll('apps/api/src/routes');
    const routeFile = files.find(({ file }) => file.endsWith('scans-correct.ts'));
    expect(routeFile).toBeDefined();
    const selectBlock = routeFile?.code.match(/SELECT_FOR_CORRECT\s*=\s*`([^`]*)`/)?.[1];
    expect(selectBlock).toBeDefined();
    expect(selectBlock).toMatch(/FOR UPDATE/);
  });

  it('ИСПЫТАНИЕ СТРАЖА: снятие FOR UPDATE (удалённая защита) красит проверку', async () => {
    const files = await readAll('apps/api/src/routes');
    const routeFile = files.find(({ file }) => file.endsWith('scans-correct.ts'));
    expect(routeFile).toBeDefined();

    // Мутация — В ПАМЯТИ: снимает РОВНО защитное слово, симулируя регресс, где кто-то
    // убрал блокировку строки (именно тот дефект, что сделал бы сценарий 2
    // конкурентного теста недетерминированным/ломающимся).
    const mutatedCode = routeFile?.code.replace('FOR UPDATE', '');
    expect(mutatedCode).not.toBe(routeFile?.code);
    const mutatedBlock = mutatedCode?.match(/SELECT_FOR_CORRECT\s*=\s*`([^`]*)`/)?.[1];
    expect(mutatedBlock).not.toMatch(/FOR UPDATE/); // КРАСНЫЙ на мутированном коде

    // Восстановление (немутированный код) — снова ЗЕЛЁНЫЙ.
    const restoredBlock = routeFile?.code.match(/SELECT_FOR_CORRECT\s*=\s*`([^`]*)`/)?.[1];
    expect(restoredBlock).toMatch(/FOR UPDATE/);
  });
});
