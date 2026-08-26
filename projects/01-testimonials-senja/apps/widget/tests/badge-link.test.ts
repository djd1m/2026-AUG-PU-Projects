// tests/badge-link.test.ts
//
// FR-GROWTH-003 @happy-path: «badge является ссылкой с UTM-метками источника».
//
// До этой фичи badge рендерился без href — то есть был некликабельным текстом, и петля
// роста была разомкнута физически: посетитель чужого сайта видел надпись, но попасть
// к нам не мог. Тесты ниже закрепляют, что ссылка есть и что она безопасна.

import { describe, expect, it } from 'vitest';
import { BADGE_CLASS, renderBadge } from '../src/badge';
import { buildSkeleton } from '../src/render';

function mount(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  buildSkeleton(root);
  return root;
}

const badgeOf = (root: ShadowRoot) => root.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`);
const URL_WITH_UTM =
  'https://proofwall.app/?utm_source=widget_badge&utm_medium=referral&utm_campaign=acme&utm_content=client.com';

describe('badge — ссылка с метками источника', () => {
  it('получает href, пришедший с сервера', () => {
    const root = mount();
    renderBadge(root, true, () => undefined, URL_WITH_UTM);
    const badge = badgeOf(root);
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('href')).toBe(URL_WITH_UTM);
  });

  it('href несёт все метки источника', () => {
    const root = mount();
    renderBadge(root, true, () => undefined, URL_WITH_UTM);
    const params = new URL(badgeOf(root)!.href).searchParams;
    expect(params.get('utm_source')).toBe('widget_badge');
    expect(params.get('utm_medium')).toBe('referral');
    expect(params.get('utm_campaign')).toBe('acme'); // чей виджет привёл
    expect(params.get('utm_content')).toBe('client.com'); // с какого сайта
  });

  it('открывается в новой вкладке и не даёт доступа к window.opener', () => {
    const root = mount();
    renderBadge(root, true, () => undefined, URL_WITH_UTM);
    const badge = badgeOf(root)!;
    expect(badge.target).toBe('_blank');
    // noopener обязателен: без него открытая страница получает ссылку на окно ЧУЖОГО
    // сайта, где стоит виджет, и может его подменить (tabnabbing).
    expect(badge.rel).toContain('noopener');
    expect(badge.rel).toContain('noreferrer');
  });

  it('ИНВАРИАНТ: небезопасная схема в href отбрасывается', () => {
    // Значение приходит ПО СЕТИ и вставляется в href на ЧУЖОМ сайте — javascript:
    // здесь выполнился бы в контексте страницы владельца.
    for (const evil of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example.com',
      ' javascript:alert(1)',
    ]) {
      const root = mount();
      renderBadge(root, true, () => undefined, evil);
      const badge = badgeOf(root)!;
      expect(badge.hasAttribute('href'), evil).toBe(false);
    }
  });

  it('badge без href всё равно рендерится — надпись остаётся на месте', () => {
    // Отсутствие ссылки не повод не показывать badge: обязательность его ПОКАЗА
    // (ADR-002) не зависит от того, доехал ли адрес.
    const root = mount();
    renderBadge(root, true, () => undefined, undefined);
    const badge = badgeOf(root);
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('Powered by Proofwall');
    expect(badge!.hasAttribute('href')).toBe(false);
  });

  it('на paid badge не рендерится, даже если ссылка пришла', () => {
    const root = mount();
    renderBadge(root, false, () => undefined, URL_WITH_UTM);
    expect(badgeOf(root)).toBeNull();
  });

  it('повторный рендер не плодит несколько badge', () => {
    const root = mount();
    for (let i = 0; i < 3; i += 1) renderBadge(root, true, () => undefined, URL_WITH_UTM);
    expect(root.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(1);
  });
});
