(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  const publicId = script?.dataset.bot;
  if (!script || !publicId || !/^[A-Za-z0-9_-]{12}$/.test(publicId)) return;
  const base = new URL(script.src).origin;
  const pageState = window as typeof window & Record<symbol, Set<string> | undefined>;
  const impressionKey = Symbol.for('n6b.widget.badge-impressions');
  const pageImpressions = pageState[impressionKey] ??= new Set<string>();
  const endpoint = (kind: string) => `${base}/api/widget/${kind}?bot=${encodeURIComponent(publicId)}`;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const host = document.createElement('n6b-widget');
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all:initial !important; position:fixed !important; right:16px !important; bottom:16px !important;
      z-index:2147483647 !important; display:block !important; width:auto !important; height:auto !important; }
    * { box-sizing:border-box; } .root { all:initial; display:block; color:#17243b; font:14px/1.5 Arial,sans-serif; }
    button,input { font:inherit; } button { cursor:pointer; border:0; border-radius:8px; padding:10px 14px;
      background:#1744ac; color:white; } button:disabled { opacity:.55; cursor:wait; }
    button:focus-visible,input:focus-visible,a:focus-visible { outline:3px solid #e4a800; outline-offset:2px; }
    .panel { width:min(360px,calc(100vw - 32px)); max-height:calc(100dvh - 96px); overflow:auto;
      background:white; border:1px solid #9aa9be; border-radius:12px; padding:14px; margin-bottom:8px;
      box-shadow:0 4px 24px #0003; } [hidden] { display:none !important; }
    header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    h2 { font-size:18px; margin:0; overflow-wrap:anywhere; } p { margin:8px 0; overflow-wrap:anywhere; }
    .privacy { font-size:12px; } .messages { max-height:300px; overflow:auto; } a { color:#1744ac; overflow-wrap:anywhere; }
    label { display:block; } input { width:100%; min-width:0; border:1px solid #9aa9be; border-radius:6px;
      padding:8px; margin:4px 0 8px; color:#17243b; background:white; }
    .badge { display:block !important; visibility:visible !important; opacity:1 !important; font:12px/1.5 Arial,sans-serif !important;
      color:#1744ac !important; margin-top:10px !important; height:auto !important; width:auto !important; }
  `);
  const originalRules = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
  shadow.adoptedStyleSheets = [sheet];
  const root = node('div'); root.className = 'root';
  const panel = node('section'); panel.className = 'panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Чат по материалам сайта');
  const header = node('header');
  const title = node('h2', 'Чат по материалам сайта');
  const close = node('button', 'Закрыть'); close.type = 'button';
  header.append(title, close);
  const messages = node('div'); messages.className = 'messages'; messages.setAttribute('aria-live', 'polite');
  const privacy = node('p'); privacy.className = 'privacy';
  const form = node('form');
  const label = node('label', 'Ваш вопрос'); label.htmlFor = 'n6b-question';
  const input = node('input'); input.id = 'n6b-question'; input.maxLength = 500; input.disabled = true;
  const submit = node('button', 'Отправить'); submit.type = 'submit'; submit.disabled = true;
  const status = node('p', 'Загрузка настроек…'); status.setAttribute('role', 'status');
  const retry = node('button', 'Повторить загрузку'); retry.type = 'button'; retry.hidden = true;
  form.append(label, input, submit);
  panel.append(header, messages, privacy, form, status, retry);
  const toggle = node('button', 'Открыть чат'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
  root.append(panel, toggle); shadow.append(root); (document.body ?? document.documentElement).append(host);
  let ready = false;
  let pending = false;
  let required = false;
  let badgeUrl = '';
  let badge: HTMLAnchorElement | undefined;
  const event = (kind: 'impression' | 'tamper') => {
    void fetch(endpoint('event'), { method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bot: publicId, kind }),
      signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  };
  const showImpression = () => {
    if (required && badge?.isConnected && !pageImpressions.has(publicId)) { pageImpressions.add(publicId); event('impression'); }
  };
  const newBadge = () => {
    badge = node('a', 'Работает на N6b'); badge.className = 'badge'; badge.href = badgeUrl;
    badge.target = '_blank'; badge.rel = 'noopener noreferrer'; root.append(badge);
  };
  const restoreBadge = () => {
    if (!required) return;
    const style = badge?.isConnected ? getComputedStyle(badge) : null;
    const broken = !badge || badge.parentNode !== root || badge.textContent !== 'Работает на N6b'
      || badge.getAttribute('href') !== badgeUrl || badge.className !== 'badge' || badge.hasAttribute('style')
      || badge.hidden || badge.rel !== 'noopener noreferrer' || badge.target !== '_blank'
      || style?.display === 'none' || style?.visibility !== 'visible' || Number(style?.opacity) === 0;
    const ancestorsBroken = root.hasAttribute('style') || root.className !== 'root' || root.hidden
      || root.parentNode !== shadow
      || shadow.adoptedStyleSheets.length !== 1 || shadow.adoptedStyleSheets[0] !== sheet;
    const stylesChanged = shadow.querySelector('style,link[rel="stylesheet"]') !== null
      || Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n') !== originalRules;
    if (broken || ancestorsBroken || stylesChanged) {
      shadow.querySelectorAll('style,link[rel="stylesheet"]').forEach((element) => element.remove());
      sheet.replaceSync(originalRules);
      root.removeAttribute('style'); root.hidden = false; root.className = 'root';
      if (root.parentNode !== shadow) shadow.append(root);
      shadow.adoptedStyleSheets = [sheet];
      badge?.remove(); newBadge(); event('tamper');
    }
    showImpression();
  };
  new MutationObserver(restoreBadge).observe(shadow, { subtree: true, childList: true, attributes: true, characterData: true });
  setInterval(restoreBadge, 2000);
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.textContent = panel.hidden ? 'Открыть чат' : 'Скрыть чат';
    if (!panel.hidden) { restoreBadge(); if (ready) input.focus(); }
  });
  close.addEventListener('click', () => {
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Открыть чат'; toggle.focus();
  });
  const controls = () => { input.disabled = !ready || pending; submit.disabled = !ready || pending; };
  async function loadConfig() {
    ready = false; controls(); retry.hidden = true; status.textContent = 'Загрузка настроек…';
    try {
      const response = await fetch(`${endpoint('config')}&page=${encodeURIComponent(location.href)}`,
        { credentials: 'omit', signal: AbortSignal.timeout(15000) });
      const payload = await response.json(); const config = payload?.data;
      const url = typeof config?.badge_url === 'string' ? new URL(config.badge_url) : null;
      if (!response.ok || typeof config?.privacy_notice !== 'string' || !config.privacy_notice
        || typeof config?.badge_required !== 'boolean' || !url || url.origin !== base
        || url.pathname !== `/r/b/${publicId}`) throw new Error('config');
      privacy.textContent = config.privacy_notice;
      title.textContent = typeof config.name === 'string' ? config.name : 'Чат по материалам сайта';
      required = config.badge_required; badgeUrl = url.href;
      if (required) { newBadge(); restoreBadge(); }
      ready = true; status.textContent = 'Задайте вопрос по материалам сайта';
    } catch {
      status.textContent = 'Не удалось загрузить настройки чата. Повторите загрузку'; retry.hidden = false;
    }
    controls();
  }
  retry.addEventListener('click', () => { void loadConfig(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!ready || pending || !input.value.trim()) return;
    pending = true; controls(); status.textContent = 'Ищем ответ…';
    const question = input.value;
    try {
      const response = await fetch(endpoint('ask'), { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bot: publicId, question }),
        signal: AbortSignal.timeout(60000) });
      const payload = await response.json();
      if (!response.ok) {
        status.textContent = typeof payload?.error?.message === 'string' ? payload.error.message : 'Сервис временно недоступен. Повторите позже';
        if (typeof payload?.contact === 'string') status.append(node('span', ` Контакт: ${payload.contact}`));
      } else {
        const data = payload?.data;
        if (typeof data?.answer_text !== 'string' || !Array.isArray(data?.citations)) throw new Error('answer');
        messages.append(node('p', `Вы: ${question}`), node('p', data.answer_text));
        for (const citation of data.citations) {
          if (typeof citation?.label !== 'string') continue;
          let url: URL | null = null;
          try { url = typeof citation.url === 'string' ? new URL(citation.url) : null; } catch { /* text-only fallback */ }
          if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
            const link = node('a', citation.label); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
            const row = node('p'); row.append(link); messages.append(row);
          } else messages.append(node('p', citation.label));
        }
        input.value = ''; status.textContent = 'Можно задать следующий вопрос';
      }
    } catch { status.textContent = 'Ответ не получен. Повторите вопрос'; }
    finally { pending = false; controls(); input.focus(); }
  });
  void loadConfig();
})();
