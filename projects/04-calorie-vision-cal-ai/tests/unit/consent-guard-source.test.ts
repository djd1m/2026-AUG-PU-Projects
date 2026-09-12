// Стражи по ИСХОДНИКУ для `consent-and-telegram-auth` (испытаны на внедрённом дефекте —
// результат в `docs/features/consent-and-telegram-auth/05_completion.md`, раздел
// «Испытание стражей», `.claude/rules/guard-must-be-able-to-fail.md`).

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function readAll(relative: string): Promise<{ file: string; code: string }[]> {
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
  return Promise.all(found.map(async (file) => ({ file: path.relative(ROOT, file), code: await readFile(file, 'utf8') })));
}

/** Строки кода без комментариев — комментарий не вызов и не отказ, литерал в нём не считается. */
function codeLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('страж NFR-consent-and-telegram-auth-1: единственная точка возврата 401', () => {
  it('POST /api/v1/auth/telegram отвечает 401 РОВНО из двух мест: единая ветка (signature или stale) и отдельная ветка replay', async () => {
    const routeFile = path.join(ROOT, 'apps/api/src/routes/auth-telegram.ts');
    const code = codeLines(await readFile(routeFile, 'utf8'));

    // Литерал `401` встречается РОВНО дважды в КОДЕ (не в комментариях) маршрута: один раз
    // внутри тернарного выражения, обрабатывающего ОБЕ причины (signature/stale) одной веткой,
    // один раз в отдельном отказе `initdata_replayed`. `.code(401)` буквально не встречается
    // вовсе — единая ветка использует `.code(verified.reason === 'missing' ? 422 : 401)`.
    const occurrences401 = code.match(/\b401\b/g) ?? [];
    expect(occurrences401).toHaveLength(2);

    // ЕДИНОЕ выражение обрабатывает ОБЕ причины проверки подлинности одной веткой.
    expect(code).toMatch(/verified\.reason === 'missing' \? 422 : 401/);

    // НЕТ отдельной ранней ветки, реагирующей ТОЛЬКО на 'stale' или ТОЛЬКО на 'signature' —
    // это и есть дефект, который «испытание стражей» внедряло и убирало (см. 05_completion.md).
    expect(code).not.toMatch(/reason === 'stale'\)/);
    expect(code).not.toMatch(/reason === 'signature'\)/);
  });
});

describe('страж Security Hardening: сравнение hash только timingSafeEqual', () => {
  it('verify-init-data.ts не сравнивает hash операторами === / ==', async () => {
    const file = path.join(ROOT, 'apps/api/src/auth/verify-init-data.ts');
    const code = await readFile(file, 'utf8');

    expect(code).toMatch(/timingSafeEqual/);
    expect(code).not.toMatch(/computedHash\s*===\s*presentedHash/);
    expect(code).not.toMatch(/presentedHash\s*===\s*computedHash/);
    expect(code).not.toMatch(/computedHash\s*==\s*presentedHash/i);
  });
});

describe('страж границы согласия: ни один INSERT в diary_entry/share_card не обходит EnforceConsentBeforeDiaryWrite', () => {
  it('каждый файл с INSERT INTO diary_entry или share_card ВЫЗЫВАЕТ enforceConsentBeforeDiaryWrite (не только импортирует)', async () => {
    // Правка по review-report.md RV-consent-and-telegram-auth-12: прежняя проверка искала имя
    // функции ГДЕ УГОДНО в файле — сохранённый `import { enforceConsentBeforeDiaryWrite }` при
    // удалённом ВЫЗОВЕ проходил бы её незамеченным. Регэксп с открывающей скобкой требует
    // ИМЕННО вызов — `import { enforceConsentBeforeDiaryWrite, type X } from …` под него не
    // подходит (после идентификатора не открывающая скобка, а запятая/закрывающая фигурная).
    const offenders: string[] = [];
    for (const { file, code } of await readAll('apps/api/src')) {
      const writesDiary = /INSERT INTO diary_entry/.test(code) || /INSERT INTO share_card/.test(code);
      if (!writesDiary) continue;
      if (!/enforceConsentBeforeDiaryWrite\(/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
