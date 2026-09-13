// Страж по исходнику AC-partner-codes-and-cabinet-11: разблокировка `partner_code` из
// `blocked` в `active` существует РОВНО в одном месте — `manual-unblock.ts`. Испытан
// внедрённым дефектом (`guard-must-be-able-to-fail.md`): квитанция — в
// `docs/features/partner-codes-and-cabinet/05_completion.md`, раздел «Испытание стражей».
//
// Внедряемый дефект (описан в `04_refinement.md`): фоновая задача
// `UPDATE partner_code SET status='active' WHERE blocked_at < now() - interval '1 hour'`
// где-нибудь в `apps/api/src` за пределами `manual-unblock.ts` — страж обязан покраснеть
// и назвать файл.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ALLOWED_FILE = path.join('apps', 'api', 'src', 'partner', 'manual-unblock.ts');

async function readAll(relative: string): Promise<{ file: string; code: string }[]> {
  const base = path.join(ROOT, relative);
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.ts$/.test(entry.name)) found.push(full);
    }
  };
  await walk(base);
  return Promise.all(found.map(async (file) => ({ file: path.relative(ROOT, file), code: await readFile(file, 'utf8') })));
}

/** Строки кода без комментариев — упоминание в комментарии (как этот файл) не отказ. */
function codeLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('страж AC-partner-codes-and-cabinet-11: разблокировка partner_code только вручную', () => {
  it('литерал `status = \'active\'` рядом с partner_code встречается ТОЛЬКО в manual-unblock.ts', async () => {
    const offenders: string[] = [];
    for (const { file, code } of await readAll('apps/api/src')) {
      if (file === ALLOWED_FILE) continue;
      const lines = codeLines(code);
      // Ищем ЛЮБОЙ UPDATE partner_code, устанавливающий status в 'active' — в пределах
      // одного оператора (до 300 символов вперёд достаточно для однострочных/многострочных
      // SQL-констант этой кодовой базы).
      const suspicious = /UPDATE\s+partner_code[\s\S]{0,300}?status\s*=\s*'active'/i.test(lines);
      if (suspicious) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('НЕТ условия на blocked_at (TTL/автоснятие) нигде за пределами manual-unblock.ts', async () => {
    const offenders: string[] = [];
    for (const { file, code } of await readAll('apps/api/src')) {
      if (file === ALLOWED_FILE) continue;
      const lines = codeLines(code);
      if (/blocked_at\s*<|blocked_at\s*<=|blocked_at.*interval/i.test(lines)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('ManualUnblockPartnerCode остаётся единственным путём и пишет manual_unblock в журнал', async () => {
    const code = await readFile(path.join(ROOT, ALLOWED_FILE), 'utf8');
    expect(code).toMatch(/status = 'active'/);
    expect(code).toMatch(/manual_unblock/);
  });
});
