// Токены оформления: каждая переменная, на которую ссылается разметка или стили,
// обязана быть ОБЪЯВЛЕНА в globals.css.
//
// Заслужено страницей входа: она ссылалась на `var(--border)`, тогда как токен называется
// `--line`. CSS в этом случае не падает и не предупреждает — свойство просто не применяется.
// Поля ввода остались без границ, и страница выглядела чужой на своём же сайте. Ошибка
// видна только глазами и только тому, кто откроет именно эту страницу.
//
// Тот же класс, что silent-fallbacks: отказ выражается не сообщением, а тихим ничем.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../src');
const GLOBALS = path.resolve(SRC, 'app/globals.css');

function filesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const allFiles = filesUnder(SRC, ['.tsx', '.ts', '.css']);

/**
 * Объявленные токены — из ДВУХ источников, и второй обязателен.
 *
 * Первая версия стража смотрела только в globals.css и объявила дефектом `var(--brand)`
 * на форме сбора. Он там объявляется INLINE, на обёртке:
 * `style={{ ['--brand']: branding.accent_color }}` — потому что фирменный цвет владельца
 * приходит из БД и в статическом CSS его быть не может.
 *
 * То есть страж кричал на верный код. Такой отключают через неделю, и вместе с ним
 * пропадает защита от настоящего случая (`--border` вместо `--line`).
 */
const declared = new Set<string>([
  ...[...readFileSync(GLOBALS, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  // inline-объявления: ['--x' as string]: … / '--x': … / "--x": …
  ...allFiles.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/['"](--[a-z0-9-]+)['"]\s*(?:as\s+string\s*\])?\s*\]?\s*:/g)]
      .map((m) => m[1]!),
  ),
]);

describe('переменные оформления объявлены', () => {
  it('в globals.css вообще есть токены', () => {
    expect(declared.size, 'дизайн-система не найдена — тест ниже был бы бессмысленным')
      .toBeGreaterThan(10);
  });

  const consumers = allFiles.filter((f) => f !== GLOBALS);

  it.each(consumers.map((f) => [path.relative(SRC, f), f] as const))(
    '%s ссылается только на существующие токены',
    (rel, full) => {
      const code = readFileSync(full, 'utf8');
      const unknown = [...code.matchAll(/var\(\s*(--[a-z0-9-]+)/g)]
        .map((m) => m[1]!)
        .filter((name) => !declared.has(name));
      expect(
        [...new Set(unknown)],
        `${rel}: переменных нет в globals.css — CSS промолчит, свойство просто не применится`,
      ).toEqual([]);
    },
  );
});

describe('страницы верстаются дизайн-системой, а не сырыми утилитами', () => {
  // Не запрет Tailwind вообще: запрет ОБХОДА системы там, где класс уже есть.
  // Главная, вход и кабинет обязаны говорить на одном языке.
  const PAGES = ['app/page.tsx', 'app/login/page.tsx', 'app/login/login-form.tsx'];
  const SYSTEM = ['stage', 'card', 'field', 'input', 'btn', 'form'];

  it.each(PAGES)('%s пользуется классами системы', (rel) => {
    const code = readFileSync(path.resolve(SRC, rel), 'utf8');
    const used = SYSTEM.filter((c) => new RegExp(`className="[^"]*\\b${c}\\b`).test(code));
    expect(used.length, `${rel}: ни одного класса дизайн-системы — верстается в обход`)
      .toBeGreaterThan(0);
    // Запрета на var() в разметке ЗДЕСЬ НЕТ намеренно: главная законно красит подсказку
    // слага в var(--ok)/var(--danger), а форма сбора прокидывает фирменный цвет владельца.
    // Существование токенов проверяет тест выше — это и есть нужная защита.
  });
});
