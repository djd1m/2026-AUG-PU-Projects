// BadgeRequired fail-closed (ADR-004 Confirmation: 11 форм плана; FR-TARIFF-001, FR-GROWTH-003 @edge-case) и ссылка
// бейджа (канон §7: /?from=<домен>&utm_source=badge). Мутация «plan.toLowerCase()» краснеет этот набор
// (scripts/test-widget-mutations.mjs).
import { describe, expect, it } from 'vitest';
import { badgeHref, badgeRequired } from '../apps/web/src/lib/badge-required';

describe('BadgeRequired — решает только план владельца из БД, строгое равенство', () => {
  it('ровно nobadge и studio снимают бейдж, free — нет', () => {
    expect(badgeRequired('nobadge')).toBe(false);
    expect(badgeRequired('studio')).toBe(false);
    expect(badgeRequired('free')).toBe(true);
  });
  it('11 непригодных форм — бейдж обязателен', () => {
    const forms: unknown[] = [null, undefined, '', 'NOBADGE', ' nobadge', 'nobadge ', 'Studio', ['nobadge'], { plan: 'nobadge' }, 0, true];
    expect(forms).toHaveLength(11);
    for (const form of forms) expect(badgeRequired(form), JSON.stringify(form) ?? 'undefined').toBe(true);
  });
});

describe('ссылка бейджа', () => {
  it('ведёт на НАШ лендинг с доменом хозяина и utm_source=badge', () => {
    expect(badgeHref('https://sufler.example', 'https://shop.example')).toBe('https://sufler.example/?from=shop.example&utm_source=badge');
    expect(badgeHref('https://sufler.example', 'http://localhost:8099')).toBe('https://sufler.example/?from=localhost&utm_source=badge');
  });
});
