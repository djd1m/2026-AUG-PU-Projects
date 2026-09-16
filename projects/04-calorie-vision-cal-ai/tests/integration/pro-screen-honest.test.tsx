// Экран Pro: ЧЕСТНОСТЬ платной страницы (OWN-001, AC-22…25).
//
// ЗАМЕНЯЕТ `limit-screen-no-payment.test.tsx`, который запрещал на экране лимита любое
// упоминание оплаты. Тот страж кодировал PD-PRICE-001 («подписки в неделе нет»), а владелец
// это решение отменил (OWN-001). Запрет платежей снят СОЗНАТЕЛЬНО и вместе с заменой на
// более сильное утверждение: платить теперь можно, но экран обязан быть честным.
//
// Почему замена, а не удаление: исходная причина запрета никуда не делась — продукт-источник
// был наказан магазином приложений именно за практики платной страницы. Запрещать слово
// «цена» больше нельзя, а требовать, чтобы цена была названа ДО нажатия, — можно и нужно.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProScreen, formatPrice } from '../../apps/web/app/pro/screen.js';

const PRICE_MINOR = 100_000;

function markup(): string {
  return renderToStaticMarkup(<ProScreen priceMinor={PRICE_MINOR} scanLimitFree={10} scanLimitPro={100} />);
}

describe('экран Pro честен до нажатия, а не после', () => {
  it('цена названа ЧИСЛОМ и периодом ДО кнопки', () => {
    const html = markup();
    expect(html).toContain('1000 ₽');
    expect(html).toContain('в месяц');
    // Цена стоит РАНЬШЕ кнопки в разметке — читатель видит её, не прокручивая.
    expect(html.indexOf('1000 ₽')).toBeLessThan(html.indexOf('<button'));
  });

  it('бесплатный путь назван ТУТ ЖЕ: продукт работает и без подписки', () => {
    const html = markup();
    expect(html).toContain('продукт продолжает работать');
    expect(html).toContain('10 распознаваний в сутки');
  });

  it('отмена описана ДО оплаты, а не спрятана в настройках', () => {
    const html = markup();
    expect(html).toContain('Отменить можно в любой момент');
    expect(html.indexOf('Отменить можно')).toBeLessThan(html.indexOf('<button'));
  });

  it('НИКАКОГО пробного периода не обещается — его не существует', () => {
    const lower = markup().toLowerCase();
    for (const forbidden of ['бесплатный период', 'пробный', 'trial', 'первые 7 дней', 'бесплатно 3 дня']) {
      expect(lower, forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('действующая подписка НЕ показывает кнопку оплаты повторно', () => {
    const html = renderToStaticMarkup(<ProScreen priceMinor={PRICE_MINOR} scanLimitFree={10} scanLimitPro={100} status="active" />);
    expect(html).not.toContain('<button');
    expect(html).toContain('Подписка действует');
  });
});

describe('демонстрационный режим виден ДО нажатия', () => {
  it('в режиме fake экран говорит, что деньги не списываются, и кнопка это повторяет', () => {
    const html = renderToStaticMarkup(
      <ProScreen priceMinor={PRICE_MINOR} scanLimitFree={10} scanLimitPro={100} paymentsMode="fake" />,
    );
    // Кнопка «Оформить за 1000 ₽», которая ничего не списывает, — ложь, даже в нашу пользу.
    expect(html).toContain('НЕ списывая денег');
    expect(html).toContain('демо, деньги не списываются');
    expect(html.indexOf('НЕ списывая денег')).toBeLessThan(html.indexOf('<button'));
  });

  it('в режиме live никакой пометки о демо нет', () => {
    const html = renderToStaticMarkup(
      <ProScreen priceMinor={PRICE_MINOR} scanLimitFree={10} scanLimitPro={100} paymentsMode="live" />,
    );
    expect(html).not.toContain('Демонстрационный режим');
    expect(html).toContain('Оформить за 1000 ₽');
  });
});

describe('formatPrice', () => {
  it('целая цена показывается без копеек: «1000,00 ₽» читается как цена с подвохом', () => {
    expect(formatPrice(100_000)).toBe('1000 ₽');
  });

  it('дробная цена показывается полностью, а не округляется в нашу пользу', () => {
    expect(formatPrice(49_950)).toBe('499,50 ₽');
    expect(formatPrice(1)).toBe('0,01 ₽');
  });
});
