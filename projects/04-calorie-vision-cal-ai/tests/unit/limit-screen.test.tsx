// LimitScreen — RenderLimitScreen (AC-pro-interest-and-limits-ui-1/2/3). Тот же приём, что
// `web-shell.test.tsx`: страница отрисовывается в строку тем же React, что и на сервере —
// jsdom не нужен, проверяем СТРОКУ разметки.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LimitScreen, formatResetAt, reasonText } from '../../apps/web/app/limit/screen.js';

describe('AC-1: экран различает личный и общий потолок', () => {
  it('scope=user и scope=global дают РАЗНЫЕ тексты, каждый называет свою причину', () => {
    const userHtml = renderToStaticMarkup(<LimitScreen scope="user" resetAt={undefined} />);
    const globalHtml = renderToStaticMarkup(<LimitScreen scope="global" resetAt={undefined} />);

    expect(userHtml).toContain('У вас на сегодня закончились сканы.');
    expect(userHtml).not.toContain('лимит платформы исчерпан');

    expect(globalHtml).toContain('На сегодня лимит платформы исчерпан, это не про вас лично.');
    expect(globalHtml).not.toContain('у вас на сегодня закончились сканы');
  });
});

describe('AC-2: неопознанный scope не выдумывает причину', () => {
  it.each(['escalation', 'что-то-ещё', undefined])('scope=%s рендерит только общий текст и логирует аномалию', (scope) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const html = renderToStaticMarkup(<LimitScreen scope={scope} resetAt={undefined} />);

    expect(html).toContain('На сегодня лимит платформы исчерпан, это не про вас лично.');
    expect(html).not.toContain('У вас на сегодня закончились сканы.');
    expect(warn).toHaveBeenCalledWith('limit_screen_unknown_scope', { scope: scope ?? null });

    warn.mockRestore();
  });

  it('признанные значения (user/global) НЕ логируют аномалию', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderToStaticMarkup(<LimitScreen scope="user" resetAt={undefined} />);
    renderToStaticMarkup(<LimitScreen scope="global" resetAt={undefined} />);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('AC-3: reset_at форматируется по Москве, отсутствующее не выдумывает час', () => {
  it('полночь по Москве форматируется как 00:00, дата обнуления НЕ сегодняшняя — дата тоже показана', () => {
    const now = new Date('2026-09-13T10:00:00Z'); // 13:00 по Москве, 13.09
    const text = formatResetAt('2026-09-14T00:00:00+03:00', now); // полночь 14.09 по Москве
    expect(text).toContain('00:00');
    expect(text).toContain('14.09');
  });

  it('дата обнуления СЕГОДНЯШНЯЯ — дата не дублируется', () => {
    const now = new Date('2026-09-13T10:00:00Z');
    const text = formatResetAt('2026-09-13T21:00:00+03:00', now); // 21:00 того же дня по Москве
    expect(text).toBe('Обновится в 21:00 по Москве.');
  });

  it('отсутствующий reset_at даёт общий текст без конкретного часа', () => {
    expect(formatResetAt(undefined)).toBe('Лимит обновится ночью по московскому времени.');
  });

  it('неразбираемый reset_at даёт общий текст, а не приблизительное время', () => {
    expect(formatResetAt('не дата')).toBe('Лимит обновится ночью по московскому времени.');
  });

  it('рендер экрана отражает оба случая', () => {
    const withReset = renderToStaticMarkup(<LimitScreen scope="user" resetAt="2026-09-13T21:00:00+03:00" />);
    expect(withReset).toContain('21:00');

    const withoutReset = renderToStaticMarkup(<LimitScreen scope="user" resetAt={undefined} />);
    expect(withoutReset).toContain('Лимит обновится ночью по московскому времени.');
  });
});

describe('reasonText — прямая проверка чистой функции', () => {
  it('РОВНО два признанных значения различимы, третье совпадает с global', () => {
    expect(reasonText('user')).not.toBe(reasonText('global'));
    expect(reasonText('escalation')).toBe(reasonText('global'));
    expect(reasonText(undefined)).toBe(reasonText('global'));
  });
});
