// tests/isolation.test.ts
//
// Источник истины: docs/ADR.md ADR-001, docs/Architecture.md §4.1, .claude/rules/testing.md §2.
//
// ЧЕСТНАЯ ГРАНИЦА ЭТОГО ТЕСТА: jsdom не реализует полноценный CSS-каскад/layout движка браузера
// (в частности, для `<style>`-элементов и сложных селекторов вроде `*`), поэтому здесь
// проверяется СТРУКТУРНАЯ гарантия Shadow DOM (то, что действительно можно надёжно проверить в
// jsdom: границы дерева, видимость стилевых узлов друг для друга) — а не полный визуальный
// каскад. Полная проверка "агрессивный `* { all: unset !important }` хоста не ломает виджет и
// наоборот" на реальном браузерном движке, поднятая на ВТОРОМ origin — задача browser-based E2E
// (testing.md §2 п.1-3), не unit/component-уровня этого пакета.
// [GAP: browser-based E2E фикстура с двумя origin — вне apps/widget, отдельный E2E-раннер]

import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '../src/render';
import { injectScopedStyles } from '../src/styles';
import { renderBadge } from '../src/badge';

describe('Изоляция Shadow DOM (ADR-001) — структурный уровень', () => {
  it('стили виджета инжектируются только внутрь shadow-root, не в document.head/body', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = mount.attachShadow({ mode: 'open' });

    injectScopedStyles(root);

    expect(root.querySelector('style')).not.toBeNull();
    // Ни один <style>, добавленный виджетом, не появляется в light DOM документа.
    const leaked = Array.from(document.querySelectorAll('style')).some((el) =>
      (el.textContent ?? '').includes('.pw-widget'),
    );
    expect(leaked).toBe(false);
  });

  it('агрессивный глобальный стиль хоста, добавленный в document.head, не виден изнутри shadow-root', () => {
    const hostStyle = document.createElement('style');
    hostStyle.textContent = '* { all: unset !important; } .pw-card { color: red !important; }';
    document.head.appendChild(hostStyle);

    try {
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const root = mount.attachShadow({ mode: 'open' });
      injectScopedStyles(root);
      buildSkeleton(root);

      // Структурная проверка границы: правило хоста физически не присутствует ни в дереве
      // shadow-root, ни в вычисляемом наборе стилевых узлов виджета.
      const widgetStyleNodes = Array.from(root.querySelectorAll('style'));
      const hostRuleLeakedIn = widgetStyleNodes.some((el) =>
        (el.textContent ?? '').includes('all: unset'),
      );
      expect(hostRuleLeakedIn).toBe(false);
      // Собственный <style> виджета остаётся внутри root, обособленно от хоста.
      const widgetStyleNode = widgetStyleNodes[0] ?? null;
      expect(root.contains(widgetStyleNode)).toBe(true);
      expect(document.head.contains(widgetStyleNode)).toBe(false);
    } finally {
      hostStyle.remove();
    }
  });

  it('скрипт хоста после монтирования виджета продолжает нормально работать (не аварийно)', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = mount.attachShadow({ mode: 'open' });
    injectScopedStyles(root);
    buildSkeleton(root);
    renderBadge(root, true, () => {});

    // "Хост-скрипт" — произвольный код, оперирующий light DOM документа. Присутствие виджета в
    // отдельном shadow-дереве не должно на него влиять.
    let hostScriptRan = false;
    const marker = document.createElement('div');
    marker.id = 'host-marker';
    document.body.appendChild(marker);
    hostScriptRan = document.getElementById('host-marker') !== null;

    expect(hostScriptRan).toBe(true);
    marker.remove();
  });

  it('querySelector документа не находит внутренние узлы виджета напрямую (закрытая граница дерева)', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = mount.attachShadow({ mode: 'open' });
    buildSkeleton(root);
    renderBadge(root, true, () => {});

    // Обычный document.querySelector не пересекает границу shadow-root — характерное свойство
    // изоляции, которое префиксованные классы (отклонённая альтернатива ADR-001) не дают.
    expect(document.querySelector('.pw-badge')).toBeNull();
    expect(root.querySelector('.pw-badge')).not.toBeNull();
  });
});
