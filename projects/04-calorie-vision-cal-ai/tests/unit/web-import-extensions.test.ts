// Страж, заслуженный сборкой 2026-09-16: `npm run typecheck` был зелёным, а `next build`
// упал с «Module not found: Can't resolve './screen.js'».
//
// ПРИЧИНА РАЗНОГЛАСИЯ: tsc сопоставляет `./x.js` файлу `./x.tsx`, а webpack внутри Next.js в
// этой конфигурации — нет. Значит типы и сборка отвечают на РАЗНЫЕ вопросы, и зелёный tsc не
// является утверждением о том, что фронт соберётся. Между ними и живёт этот класс дефекта.
//
// Проверяется СВОЙСТВО ИСХОДНИКА, а не поведение одной сборки: сборка образа стоит минуты,
// а эта проверка — миллисекунды, и падает она в том же прогоне, что и остальные.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_APP = fileURLToPath(new URL('../../apps/web/app/', import.meta.url));

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

describe('импорты внутри apps/web не используют расширение .js', () => {
  it('ни один относительный импорт не заканчивается на .js — иначе next build упадёт', () => {
    const offenders: string[] = [];
    for (const file of walk(WEB_APP)) {
      const code = readFileSync(file, 'utf8');
      for (const line of code.split('\n')) {
        // Только ОТНОСИТЕЛЬНЫЕ импорты: пакеты (`@n4/shared`, `next/navigation`) ни при чём.
        const match = /from\s+'(\.[^']*\.js)'/.exec(line);
        if (match !== null) offenders.push(`${path.relative(WEB_APP, file)}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
