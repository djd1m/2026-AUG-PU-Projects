// из N1: projects/01-testimonials-senja/apps/widget/src/styles.ts — адаптировано: карточки отзывов → пузырь и окно
// чата; `<style>` в корне донора заменён на `adoptedStyleSheets` (FR-WIDGET-003: инлайновый <style> требует от
// хозяина `unsafe-inline`); `contain: content` донора убран — он делает `position: fixed` окна относительным узлу,
// а не экрану; палитра — токены design-shell N6 (A-N6-031: один бирюзовый акцент).
//
// Почему `!important` на :host. Узел-хозяин живёт в light DOM, и CSS хозяина (`* { … }`, `div { z-index }`) до
// него ДОСТАЁТ. По каскаду для обычных объявлений побеждает внешний контекст, для `!important` — внутренний
// (теневой). Поэтому только `!important` на :host удерживает положение и сброс против враждебного CSS. Внутри
// корня внешние селекторы не действуют вовсе; наследование обрезано `all: initial` на `.n6` (CSS хозяина через
// наследование `font-size`/`color` иначе просочился бы).
//
// Единицы — px, свои (FR-WIDGET-001): rem хозяина (html { font-size: 30px }) не должен масштабировать окно.
// Цели касания ≥ 44 px (пузырь 56 px, FR-LOOK-011). ≤ 400 px — окно на весь экран (FR-WIDGET-001).

const HOST = `:host{all:initial !important;display:block !important;position:fixed !important;right:16px !important;bottom:16px !important;
top:auto !important;left:auto !important;width:56px !important;height:56px !important;margin:0 !important;padding:0 !important;border:0 !important;
transform:none !important;filter:none !important;opacity:1 !important;visibility:visible !important;z-index:2147483000 !important;
contain:none !important;overflow:visible !important;box-sizing:border-box !important}`;

const LIGHT = '--bg:#ffffff;--fg:#14171a;--muted:#555e69;--line:#d6dbe1;--soft:#eef1f4;--accent:#0b6e76;--accent-fg:#ffffff;--bubble:#14171a;--bubble-fg:#ffffff;--shadow:rgba(20,23,26,.22)';
const DARK = '--bg:#15191d;--fg:#eef1f4;--muted:#a9b2bc;--line:#333b44;--soft:#222931;--accent:#5fd0d8;--accent-fg:#0b1214;--bubble:#eef1f4;--bubble-fg:#14171a;--shadow:rgba(0,0,0,.5)';

const BODY = `
.n6{all:initial;${LIGHT};display:block;position:relative;width:56px;height:56px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
font-size:15px;line-height:1.45;color:var(--fg);-webkit-font-smoothing:antialiased;text-align:left}
:host([data-theme="dark"]) .n6{${DARK}}
@media (prefers-color-scheme: dark){:host(:not([data-theme="light"])) .n6{${DARK}}}
.n6 *,.n6 *::before,.n6 *::after{box-sizing:border-box;font-family:inherit;letter-spacing:normal;text-transform:none}
.bubble{all:initial;box-sizing:border-box;width:56px;height:56px;border-radius:28px;background:var(--bubble);color:var(--bubble-fg);display:flex;
align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px var(--shadow)}
.bubble:focus-visible,.icon-btn:focus-visible,.send:focus-visible,.n6-badge:focus-visible,.src summary:focus-visible,.link:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.bubble svg{width:26px;height:26px;display:block}
.panel{position:absolute;right:0;bottom:72px;width:360px;height:560px;max-height:calc(100vh - 104px);display:flex;flex-direction:column;
background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 12px 40px var(--shadow)}
.panel[hidden]{display:none}
.head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 16px;border-bottom:1px solid var(--line);min-height:60px}
.title{margin:0;flex:1;font-size:16px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.icon-btn{all:initial;box-sizing:border-box;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--fg)}
.icon-btn svg{width:20px;height:20px;display:block}
.log{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px;margin:0;list-style:none}
.msg{max-width:88%;padding:10px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.45}
.msg.bot{align-self:flex-start;background:var(--soft);color:var(--fg)}
.msg.user{align-self:flex-end;background:var(--accent);color:var(--accent-fg)}
.msg.note{align-self:stretch;max-width:100%;background:transparent;color:var(--muted);font-size:13px;padding:0}
.src{margin-top:8px;font-size:13px;color:var(--muted)}
.src summary{cursor:pointer;min-height:44px;display:flex;align-items:center;overflow-wrap:anywhere}
.src p{margin:4px 0 8px;white-space:pre-wrap}
.link{color:var(--fg);text-decoration:underline;display:inline-flex;align-items:center;min-height:44px}
.warn{margin:0;padding:8px 16px;font-size:12px;color:var(--muted);border-top:1px solid var(--line)}
.form{display:flex;gap:8px;padding:8px 16px 8px}
.input{all:initial;box-sizing:border-box;flex:1;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;
background:var(--bg);color:var(--fg);font-family:inherit;font-size:16px;line-height:1.3}
.input:focus{outline:2px solid var(--accent);outline-offset:0}
.send{all:initial;box-sizing:border-box;min-width:44px;min-height:44px;padding:0 14px;border-radius:10px;background:var(--fg);color:var(--bg);
font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center}
.send[disabled]{opacity:.55;cursor:default}
.n6-foot{display:flex;justify-content:center;padding:0 16px 6px;min-height:28px}
.n6-badge{display:inline-flex;align-items:center;min-height:28px;font-size:12px;color:var(--muted);text-decoration:none}
.n6-badge:hover{text-decoration:underline}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:400px){.panel{position:fixed;top:0;right:0;bottom:0;left:0;width:100vw;height:100vh;height:100dvh;max-height:none;border:0;border-radius:0}}
@media (prefers-reduced-motion:no-preference){.bubble{transition:transform .15s ease}.bubble:hover{transform:scale(1.04)}}
`;

export const WIDGET_CSS = HOST + BODY;

// Стили — ТОЛЬКО adoptedStyleSheets (constructable stylesheet не подпадает под style-src хозяина). Браузер без них
// (Safari < 16.4) получает НИЧЕГО, а не инлайновый <style>, который под строгим CSP хозяина всё равно был бы
// отвергнут, а без CSP — единственное место, где виджет требовал бы unsafe-inline (fail-closed).
export function adoptStyles(root: ShadowRoot): boolean {
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in root) || typeof CSSStyleSheet.prototype.replaceSync !== 'function') return false;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(WIDGET_CSS);
    root.adoptedStyleSheets = [sheet];
    return true;
  } catch { return false; }
}
