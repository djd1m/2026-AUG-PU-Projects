// FR-GROWTH-001 @security — «без подтверждения не отправляется ни одного запроса
// к внешней сети».
//
// Это свойство КОДА, а не поведения одного прогона, поэтому проверяется разбором
// исходника, а не рендером: рендер-тест подтвердил бы только тот путь, который сам
// прошёл, и молча пропустил бы новый вызов fetch, добавленный завтра в другую ветку.
// Слой 1 по лестнице стоимости обнаружения (CLAUDE.md).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.resolve(__dirname, '../src/app/dashboard/[slug]/share-cta.tsx');
const CONFIRM_FN = 'async function confirmShare()';

/** Границы тела функции по балансу фигурных скобок. */
function functionBody(src: string, signature: string): { start: number; end: number } {
  const sigAt = src.indexOf(signature);
  if (sigAt === -1) throw new Error(`не найдена функция подтверждения: ${signature}`);
  const start = src.indexOf('{', sigAt);
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error('не удалось найти конец тела функции');
}

// Всё, что может уйти в сеть или к внешнему обработчику публикации.
const NETWORK_CALLS = [
  'fetch(',
  'navigator.share',
  'navigator.clipboard',
  'XMLHttpRequest',
  'sendBeacon',
  'new WebSocket',
  'new EventSource',
  'import(',
];

describe('share-CTA не обращается в сеть до подтверждения', () => {
  const src = readFileSync(SOURCE, 'utf8');
  // Комментарии выкидываем: в них эти имена упоминаются по делу и не являются вызовами.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const { start, end } = functionBody(code, CONFIRM_FN);

  it.each(NETWORK_CALLS)('вызов %s не встречается вне confirmShare', (needle) => {
    const outside: number[] = [];
    let at = code.indexOf(needle);
    while (at !== -1) {
      if (at < start || at > end) outside.push(at);
      at = code.indexOf(needle, at + 1);
    }
    expect(
      outside,
      `${needle} найден вне тела confirmShare (смещения: ${outside.join(', ')})`,
    ).toEqual([]);
  });

  it('confirmShare вызывается ТОЛЬКО из обработчика кнопки подтверждения', () => {
    // Ровно два упоминания: объявление и onClick в диалоге. Любое третье —
    // потенциально автоматический вызов, который сценарий и запрещает.
    const mentions = code.split('confirmShare').length - 1;
    expect(mentions).toBe(2);
    expect(code).toContain('onClick={confirmShare}');
  });

  it('нет useEffect — то есть нет пути «сделать запрос при показе CTA»', () => {
    expect(code).not.toContain('useEffect');
  });

  it('сам компонент существует и содержит шаг подтверждения', () => {
    expect(code).toContain(CONFIRM_FN);
    expect(code).toContain('setConfirming');
  });
});
