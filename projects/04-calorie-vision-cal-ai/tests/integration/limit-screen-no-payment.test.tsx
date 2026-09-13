// AC-pro-interest-and-limits-ui-4: на экране лимита нет ни одного платёжного элемента.
//
// Слой — снимок разметки (`04_refinement.md`, «Стратегия проверок»): проверка не ходит в
// БД и не поднимает Next.js, но живёт в `tests/integration/` рядом с `web-shell.test.tsx` —
// та же причина ("страница отрисовывается в строку тем же React, что и на сервере").

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LimitScreen } from '../../apps/web/app/limit/screen.js';

const FORBIDDEN_SUBSTRINGS = ['цена', 'тариф', 'оплатить', '₽', '$', 'price', 'payment'];

describe('на экране лимита нет ни одного платёжного элемента', () => {
  it.each([
    { scope: 'user', resetAt: undefined },
    { scope: 'global', resetAt: '2026-09-14T00:00:00+03:00' },
  ])('scope=$scope: ни одно запрещённое слово не найдено, есть текст «оплаты сейчас нет»', ({ scope, resetAt }) => {
    const html = renderToStaticMarkup(<LimitScreen scope={scope} resetAt={resetAt} />);
    const lower = html.toLowerCase();

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(lower).not.toContain(forbidden.toLowerCase());
    }

    // Никакого элемента формы оплаты: ни `type="submit"` для платежа, ни поля номера карты.
    expect(html).not.toMatch(/card[-_]?number/i);
    expect(lower).not.toContain('subscribe');
    expect(lower).not.toContain('подпис');

    expect(lower).toContain('оплаты сейчас нет');
  });
});
