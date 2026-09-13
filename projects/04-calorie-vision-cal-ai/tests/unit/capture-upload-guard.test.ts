// Страж по ИСХОДНИКУ: `apps/web/app/capture-upload.ts` не обращается ни к какому абсолютному
// адресу — только относительный путь (`middleware.ts`: `connect-src 'self'`; второго origin
// у web нет и не будет). Стерегёт свойство КОДА, а не поведение одного прогона
// (`.claude/rules/guard-must-be-able-to-fail.md`) — испытан мутацией ниже.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE = path.join(ROOT, 'apps/web/app/capture-upload.ts');

/** Строки кода без комментариев — литерал в комментарии не вызов и не отказ. */
function codeLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('страж: capture-upload.ts не обращается к абсолютному адресу', () => {
  it('в КОДЕ (не в комментариях) нет ни одного литерала http:// или https://', async () => {
    const code = codeLines(await readFile(FILE, 'utf8'));

    expect(code).not.toMatch(/https?:\/\//);
  });

  it('оба сетевых адреса — относительные строковые константы, начинающиеся с "/"', async () => {
    const code = await readFile(FILE, 'utf8');

    expect(code).toMatch(/SCANS_URL\s*=\s*'\/api\/v1\/scans'/);
    expect(code).toMatch(/AUTH_DEVICE_URL\s*=\s*'\/api\/v1\/auth\/device'/);
  });

  it('испытание: страж ПАДАЕТ, если в код внедрён абсолютный адрес (guard-must-be-able-to-fail)', () => {
    // Не мутирует настоящий файл — доказывает, что сама проверка различает хорошее и плохое,
    // прогоняя ту же логику на внедрённом дефекте отдельно от прогона на реальном исходнике.
    const withDefect = "const SCANS_URL = 'https://evil.example.com/api/v1/scans';";
    expect(codeLines(withDefect)).toMatch(/https?:\/\//);
  });
});
