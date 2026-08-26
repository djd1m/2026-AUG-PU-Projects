// tests/badge-integrity.test.ts
//
// Источник истины: docs/Pseudocode.md §5.2, docs/ADR.md ADR-002, docs/Specification.md
// FR-GROWTH-003 (@security сценарии), .claude/rules/testing.md §2, docs/Refinement.md §3.1.
//
// Три уровня проверки, каждый честно ограничен возможностями jsdom (см. заголовок src/badge.ts):
//   1. Чистая функция `classifyBadgeVisibility` — синтетические значения, включая
//      "родительский hide" (offsetWidth/Height=0 без isHiddenDirectly). Это единственный
//      надёжный способ проверить эту ветку: jsdom не считает реальный layout, поэтому
//      offsetWidth/offsetHeight на настоящих DOM-узлах в jsdom ВСЕГДА равны 0 независимо от
//      видимости — тест на реальных узлах не смог бы отличить "предок скрыт" от "просто jsdom".
//   2. Реальный DOM + `checkAndRestore` — позитивный случай (прямое скрытие узла badge), который
//      jsdom считает корректно через `getComputedStyle` (display/visibility/opacity из инлайн-
//      стиля, без layout).
//   3. Реальный DOM — негативный сценарий: убеждаемся, что при "родительском" скрытии (снаружи
//      shadow-root) `checkAndRestore` НЕ трогает стиль самого badge (нет ложного восстановления)
//      и что несколько тиков подряд не накапливают побочных эффектов (нет цикла восстановления).
//
// [GAP: полная проверка на реальном layout/каскаде CSS на втором origin — задача browser-based
// E2E (testing.md §2), не unit/integration-уровня этого пакета.]

import { describe, expect, it, vi } from 'vitest';
import {
  BADGE_CLASS,
  checkAndRestore,
  classifyBadgeVisibility,
  renderBadge,
  startBadgeIntegrityWatch,
} from '../src/badge';
import { buildSkeleton } from '../src/render';

function freshWidget(): { mount: HTMLElement; root: ShadowRoot } {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = mount.attachShadow({ mode: 'open' });
  buildSkeleton(root);
  return { mount, root };
}

const noopClick = () => {};

describe('classifyBadgeVisibility — чистая решающая логика (без DOM)', () => {
  it('null снапшот => missing (узел удалён целиком)', () => {
    expect(classifyBadgeVisibility(null)).toBe('missing');
  });

  it('display:none на самом узле => hidden-direct (детектируется и чинится)', () => {
    const verdict = classifyBadgeVisibility({
      display: 'none',
      visibility: 'visible',
      opacity: '1',
      hidden: false,
      offsetWidth: 80,
      offsetHeight: 20,
    });
    expect(verdict).toBe('hidden-direct');
  });

  it('visibility:hidden => hidden-direct', () => {
    expect(
      classifyBadgeVisibility({
        display: 'inline-flex',
        visibility: 'hidden',
        opacity: '1',
        hidden: false,
        offsetWidth: 80,
        offsetHeight: 20,
      }),
    ).toBe('hidden-direct');
  });

  it('opacity:0 => hidden-direct', () => {
    expect(
      classifyBadgeVisibility({
        display: 'inline-flex',
        visibility: 'visible',
        opacity: '0',
        hidden: false,
        offsetWidth: 80,
        offsetHeight: 20,
      }),
    ).toBe('hidden-direct');
  });

  it('атрибут hidden=true => hidden-direct (FR-GROWTH-003 @security: "style/hidden")', () => {
    expect(
      classifyBadgeVisibility({
        display: 'inline-flex',
        visibility: 'visible',
        opacity: '1',
        hidden: true,
        offsetWidth: 80,
        offsetHeight: 20,
      }),
    ).toBe('hidden-direct');
  });

  it('нулевой размер БЕЗ прямого скрытия => zero-size-ancestor (НЕ чинится, только лог)', () => {
    // Ровно сценарий "скрыт родительский контейнер снаружи shadow-root": computedStyle на самом
    // узле честный (display != none), но offsetWidth/Height обнулены схлопыванием предка.
    const verdict = classifyBadgeVisibility({
      display: 'inline-flex',
      visibility: 'visible',
      opacity: '1',
      hidden: false,
      offsetWidth: 0,
      offsetHeight: 0,
    });
    expect(verdict).toBe('zero-size-ancestor');
  });

  it('нормальная видимость => ok', () => {
    expect(
      classifyBadgeVisibility({
        display: 'inline-flex',
        visibility: 'visible',
        opacity: '1',
        hidden: false,
        offsetWidth: 80,
        offsetHeight: 20,
      }),
    ).toBe('ok');
  });
});

describe('renderBadge — решение сервера, не клиента (ADR-002/FR-GROWTH-003)', () => {
  it('badge_required=false — badge не рендерится вообще', () => {
    const { root } = freshWidget();
    renderBadge(root, false, noopClick);
    expect(root.querySelector(`.${BADGE_CLASS}`)).toBeNull();
  });

  it('badge_required=true — badge рендерится как ссылка', () => {
    const { root } = freshWidget();
    renderBadge(root, true, noopClick);
    const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
    expect(badge?.tagName).toBe('A');
  });
});

describe('checkAndRestore — позитивный случай: прямое скрытие узла badge восстанавливается', () => {
  // Ассерты ниже читают `badge.style.display` (инлайн-стиль), а не `getComputedStyle(badge)
  // .display`. Это не ослабление проверки, а следствие двух вещей: (1) src/badge.ts сам читает
  // инлайн-стиль в первую очередь — см. комментарий у `snapshotOf` в src/badge.ts, это и есть
  // проверяемое поведение; (2) jsdom (тестовая среда) не реализует получение computed style для
  // узлов ВНУТРИ shadow-root — `getComputedStyle` для них всегда возвращает пустые строки
  // независимо от инлайн-стиля (проверено отдельно, не наша догадка). Полагаться здесь на
  // `getComputedStyle` означало бы либо ложно-зелёный тест, либо ложно-красный на корректном
  // коде — оба хуже честного inline-style ассерта.
  it('display:none на .pw-badge откатывается назад', () => {
    const { root } = freshWidget();
    renderBadge(root, true, noopClick);
    const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)!;

    badge.style.display = 'none';

    const logs: string[] = [];
    checkAndRestore(root, true, noopClick, (name) => logs.push(name));

    expect(badge.style.display).not.toBe('none');
    expect(logs).toContain('badge_hide_attempt_blocked');
  });

  it('атрибут hidden=true откатывается назад (FR-GROWTH-003 @security: "style/hidden")', () => {
    const { root } = freshWidget();
    renderBadge(root, true, noopClick);
    const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)!;

    badge.hidden = true;

    const logs: string[] = [];
    checkAndRestore(root, true, noopClick, (name) => logs.push(name));

    expect(badge.hidden).toBe(false);
    expect(logs).toContain('badge_hide_attempt_blocked');
  });

  it('удаление узла badge целиком — пересоздаётся', () => {
    const { root } = freshWidget();
    renderBadge(root, true, noopClick);
    root.querySelector(`.${BADGE_CLASS}`)?.remove();
    expect(root.querySelector(`.${BADGE_CLASS}`)).toBeNull();

    checkAndRestore(root, true, noopClick);

    expect(root.querySelector(`.${BADGE_CLASS}`)).not.toBeNull();
  });

  it('startBadgeIntegrityWatch реагирует на мутацию через MutationObserver', async () => {
    const { root } = freshWidget();
    renderBadge(root, true, noopClick);
    const handle = startBadgeIntegrityWatch(root, true, noopClick);

    const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)!;
    badge.style.display = 'none';

    // MutationObserver-коллбэк — микрозадача; дожидаемся её явно, не полагаясь на таймеры.
    await Promise.resolve();
    await Promise.resolve();

    expect(badge.style.display).not.toBe('none');
    handle.stop();
  });
});

describe('checkAndRestore — негативный случай: родительский hide НЕ детектируется как чинимый', () => {
  it('скрытие обёртки СНАРУЖИ shadow-root не приводит к ложному восстановлению стиля badge', () => {
    // "Родитель" здесь — mount-элемент в light DOM (снаружи root), намеренно скрытый.
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = mount.attachShadow({ mode: 'open' });
    buildSkeleton(root);
    renderBadge(root, true, noopClick);
    const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)!;

    mount.style.display = 'none'; // за границей shadow-root — badge сам по себе не тронут
    const styleBefore = badge.getAttribute('style');

    const logs: string[] = [];
    // Несколько тиков подряд — как повторные срабатывания setInterval в реальном рантайме.
    checkAndRestore(root, true, noopClick, (name) => logs.push(name));
    checkAndRestore(root, true, noopClick, (name) => logs.push(name));
    checkAndRestore(root, true, noopClick, (name) => logs.push(name));

    // Не было попытки "починить" через forceVisibleStyles — инлайн-стиль узла не менялся этим
    // вызовом (jsdom не считает offsetWidth/Height, поэтому здесь узел классифицируется как 'ok'
    // на уровне DOM-теста; сам факт "не чиним" при zero-size — покрыт чистой функцией выше).
    expect(badge.getAttribute('style')).toBe(styleBefore);
    expect(logs).not.toContain('badge_hide_attempt_blocked');
  });

  it('не создаёт бесконечный цикл восстановления при повторных тиках (Refinement.md §3.1)', () => {
    vi.useFakeTimers();
    try {
      const { root } = freshWidget();
      renderBadge(root, true, noopClick);
      const badge = root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)!;
      const setPropertySpy = vi.spyOn(badge.style, 'setProperty');

      const handle = startBadgeIntegrityWatch(root, true, noopClick);
      // Продвигаем время на 10 тиков подряд без какого-либо реального вмешательства в badge.
      for (let i = 0; i < 10; i += 1) {
        vi.advanceTimersByTime(2000);
      }
      handle.stop();

      // Без вмешательства forceVisibleStyles ни разу не вызывается — не крутим восстановление
      // вхолостую на каждый тик.
      expect(setPropertySpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
