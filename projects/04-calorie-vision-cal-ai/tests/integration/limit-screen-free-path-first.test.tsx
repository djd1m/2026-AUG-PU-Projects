// Экран лимита: бесплатный путь называется ПЕРВЫМ (OWN-001).
//
// ЗАМЕНЯЕТ `limit-screen-no-payment.test.tsx`. Тот запрещал на экране лимита любое
// упоминание оплаты и кодировал отменённое решение PD-PRICE-001. Замена, а не удаление:
// исходная причина запрета — продукт-источник наказан магазином приложений за практики
// платной страницы — осталась. Изменилось только то, что продавать теперь можно.
//
// Экран лимита — самая уязвимая точка продукта: человек только что упёрся в стену. Начинать
// её с продажи и есть та практика, которой мы не воспроизводим.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LimitScreen } from '../../apps/web/app/limit/screen.js';

describe('экран лимита не начинается с продажи', () => {
  it.each([
    { scope: 'user', resetAt: undefined },
    { scope: 'global', resetAt: '2026-09-17T00:00:00+03:00' },
  ])('scope=$scope: бесплатный путь назван РАНЬШЕ платного', ({ scope, resetAt }) => {
    const html = renderToStaticMarkup(<LimitScreen scope={scope} resetAt={resetAt} />);

    const freeAt = html.indexOf('Подождать до обновления счётчика');
    const proAt = html.indexOf('/pro');
    expect(freeAt).toBeGreaterThanOrEqual(0);
    expect(proAt).toBeGreaterThanOrEqual(0);
    expect(freeAt).toBeLessThan(proAt);
  });

  it('на экране лимита нет ФОРМЫ оплаты — только ссылка: оплата начинается там, где названа цена', () => {
    const html = renderToStaticMarkup(<LimitScreen scope="user" resetAt={undefined} />);
    expect(html).not.toMatch(/card[-_]?number/i);
    // Ни цены, ни кнопки списания: на этом экране их быть не должно.
    expect(html).not.toContain('₽');
    expect(html.toLowerCase()).not.toContain('оплатить');
  });

  it('устаревшее утверждение «оплаты сейчас нет» больше не показывается', () => {
    const html = renderToStaticMarkup(<LimitScreen scope="user" resetAt={undefined} />);
    // Оно стало ложью в момент, когда появилась подписка.
    expect(html.toLowerCase()).not.toContain('оплаты сейчас нет');
  });

  it('время обновления счётчика по-прежнему называется: бесплатный путь обязан быть конкретным', () => {
    const html = renderToStaticMarkup(<LimitScreen scope="user" resetAt="2026-09-17T00:00:00+03:00" />);
    expect(html).toMatch(/Обновится в \d{2}:\d{2} по Москве/);
  });
});
