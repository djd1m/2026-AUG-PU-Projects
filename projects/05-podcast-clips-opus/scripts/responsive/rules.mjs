// Executed in the page realm; keep browser helpers inside this function.
export async function domRules(page, rules = ['R1', 'R2', 'R3', 'R5', 'R6']) {
  return page.evaluate(async (enabled) => {
    const findings = [];
    const selector = el => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (; el && el.nodeType === 1; el = el.parentElement) {
        parts.unshift(`${el.localName}:nth-of-type(${[...el.parentNode?.children ?? []].filter(x => x.localName === el.localName).indexOf(el) + 1})`);
      }
      return parts.join(' > ');
    };
    const visible = el => {
      if (el.checkVisibility?.({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) === false) return false;
      // Also covers engines without checkVisibility or with incomplete details support.
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.matches('details:not([open])')) {
          const summary = [...p.children].find(child => child.localName === 'summary');
          if (!summary?.contains(el)) return false;
        }
      }
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      for (let p = el; p; p = p.parentElement) if (Number(getComputedStyle(p).opacity) === 0) return false;
      return s.visibility !== 'hidden' && s.visibility !== 'collapse' && s.display !== 'none' && r.width > 0 && r.height > 0;
    };
    const add = (rule, el, message, size, severity = 'error') => findings.push({ rule, selector: selector(el), message, size, severity });
    const rect = el => {
      const rs = [el, ...(el.matches('input[type=checkbox],input[type=radio]') ? [...el.labels ?? []] : [])].filter(visible).map(x => x.getBoundingClientRect());
      const left = Math.min(...rs.map(r => r.left)), top = Math.min(...rs.map(r => r.top));
      const right = Math.max(...rs.map(r => r.right)), bottom = Math.max(...rs.map(r => r.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    if (enabled.includes('R1') && document.documentElement.scrollWidth > innerWidth) {
      const offenders = [...document.body.querySelectorAll('*')].filter(el => {
        if (!visible(el) || el.getBoundingClientRect().right <= innerWidth) return false;
        for (let p = el.parentElement; p; p = p.parentElement) if (/^(auto|scroll)$/.test(getComputedStyle(p).overflowX)) return false;
        return true;
      });
      for (const el of offenders.length ? offenders : [document.documentElement]) add('R1', el, 'Горизонтальный скролл', { width: document.documentElement.scrollWidth, viewport: innerWidth });
    }
    const targets = [...document.querySelectorAll('button,a[href],[role=button],summary,select,input:not([type=hidden]),textarea,[tabindex]:not([tabindex="-1"]), [onclick]')]
      .filter(el => visible(el) && !el.matches(':disabled,[aria-disabled=true]'));
    const inline = el => {
      if (!el.matches('a')) return false;
      let parent = el.parentElement;
      while (parent && ['inline', 'contents'].includes(getComputedStyle(parent).display)) parent = parent.parentElement;
      if (!parent?.matches('p,li')) return false;
      const copy = parent.cloneNode(true); copy.querySelectorAll('a').forEach(a => a.remove());
      return !!copy.textContent.trim();
    };
    for (const el of targets) {
      const r = rect(el);
      if (enabled.includes('R2') && !inline(el)) {
        const primary = el.matches('button,a,[role=button],summary,select,input,textarea');
        const small = r.width < (primary ? 44 : 24) || r.height < (primary ? 44 : 24);
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        const crowded = targets.some(other => {
          if (other === el || other.contains(el) || el.contains(other)) return false;
          const q = rect(other);
          const dx = Math.max(q.left - cx, 0, cx - q.right), dy = Math.max(q.top - cy, 0, cy - q.bottom);
          return dx * dx + dy * dy < 12 * 12;
        });
        if (small && (primary || crowded)) add('R2', el, primary ? 'Основная цель меньше 44×44' : 'Цель меньше 24×24 без зазора', r);
      }
      if (enabled.includes('R3')) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const q = el.getBoundingClientRect(), x = (q.left + q.right) / 2, y = (q.top + q.bottom) / 2;
        if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== el && !el.contains(hit) && ![...el.labels ?? []].some(l => l.contains(hit))) add('R3', el, 'Цель перекрыта', rect(el), 'warning');
      }
    }
    if (enabled.includes('R5')) {
      for (const el of document.querySelectorAll('input:not([type]),input[type=text],input[type=email],input[type=password],input[type=url],input[type=search],input[type=tel],input[type=number],select,textarea')) {
        if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16) add('R5', el, 'Шрифт поля меньше 16px', { fontSize: parseFloat(getComputedStyle(el).fontSize) });
      }
      const meta = document.querySelector('meta[name=viewport]');
      if (meta && (/user-scalable\s*=\s*no/i.test(meta.content) || Number(meta.content.match(/maximum-scale\s*=\s*([\d.]+)/i)?.[1] ?? 2) < 2)) add('R5', meta, 'Запрещено увеличение viewport');
      document.querySelectorAll('video:not([playsinline])').forEach(el => add('R5', el, 'Нет playsinline'));
    }
    if (enabled.includes('R6') && ((innerWidth === 390 && innerHeight === 844) || (innerWidth === 1440 && innerHeight === 900))) {
      for (const el of document.querySelectorAll('video')) {
        if (!visible(el)) continue;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) add('R6', el, 'Превью не помещается по высоте', { top: r.top, bottom: r.bottom, viewportHeight: innerHeight }, 'warning');
      }
    }
    return findings;
  }, rules);
}

export async function textZoomRule(page) {
  return page.evaluate(async () => {
    const root = document.documentElement, old = root.style.fontSize;
    const nodes = [...document.querySelectorAll('body,h1,label,p')].filter(el => el.getBoundingClientRect().height > 0 && el.textContent.trim());
    const before = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
    root.style.fontSize = '200%';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const findings = [];
      nodes.forEach((el, i) => {
        const after = parseFloat(getComputedStyle(el).fontSize);
        if (after / before[i] < 1.8) findings.push({ rule: 'R8', severity: 'error', selector: el.id ? `#${CSS.escape(el.id)}` : `${el.localName}[sample=${i}]`, message: 'Текст не масштабируется', size: { before: before[i], after, ratio: after / before[i] } });
      });
      if (!nodes.length) throw new Error('Нет выборки текста для R8');
      if (root.scrollWidth > innerWidth) findings.push({ rule: 'R8', severity: 'error', selector: 'html', message: 'Скролл при 200%', size: { width: root.scrollWidth, viewport: innerWidth } });
      return findings;
    } finally { root.style.fontSize = old; }
  });
}

export async function axeRule(page) {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } }).analyze();
  const findings = [...result.violations.map(v => ({ ...v, incomplete: false })), ...result.incomplete.map(v => ({ ...v, incomplete: true }))]
    .flatMap(v => v.nodes.map(node => ({ rule: 'R4', axeRule: v.id, selector: node.target.join(' '),
      severity: !v.incomplete && ['serious', 'critical'].includes(v.impact) ? 'error' : 'warning',
      impact: v.impact, incomplete: v.incomplete, message: v.help, size: null })));
  // Use the same selector representation as R2, so summary deduplication is exact.
  for (const finding of findings) {
    const geometry = await page.evaluate(selector => {
      let el;
      try { el = document.querySelector(selector); } catch { return null; }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      let canonical;
      if (el.id) canonical = `#${CSS.escape(el.id)}`;
      else {
        const parts = [];
        for (let node = el; node; node = node.parentElement) parts.unshift(`${node.localName}:nth-of-type(${[...node.parentNode?.children ?? []].filter(x => x.localName === node.localName).indexOf(node) + 1})`);
        canonical = parts.join(' > ');
      }
      return { selector: canonical, size: { width: r.width, height: r.height } };
    }, finding.selector);
    if (geometry) Object.assign(finding, geometry);
  }
  return findings;
}

export function lintCSS(source, filename) {
  const css = filename.endsWith('.css') ? source : [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\b100vh\b|clamp\([^;{}]*?\b[\d.]+px[^;{}]*?\)/g)]
    .map(m => ({ rule: 'R7', severity: 'warning', selector: filename, message: m[0], size: null }));
}

export const FIRST_SCREEN_VIEWPORTS = [{ w: 390, h: 844 }, { w: 375, h: 667 }, { w: 360, h: 740 }];
export const FIRST_SCREEN_ACTIONS = [
  { pattern: /^\/$/, selector: 'form.auth-card button:not([type=button])' },
  { pattern: /^\/c\/[\w-]+$/, selector: '.cta' },
];
export function firstScreenSelector(route) {
  return FIRST_SCREEN_ACTIONS.find(action => action.pattern.test(route))?.selector ?? null;
}
// Run immediately after navigation/preconditions, before anything can scroll the page.
export async function firstScreenRule(page, selector) {
  return page.evaluate(selector => {
    const visible = el => {
      if (el.checkVisibility?.({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) === false) return false;
      for (let parent = el; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
        if (parent.matches('details:not([open])') && !parent.querySelector(':scope > summary')?.contains(el)) return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const element = [...document.querySelectorAll(selector)].find(visible);
    const finding = { rule: 'R9', severity: 'error', selector, scrollY, innerHeight, rect: null };
    if (!element) return [{ ...finding, message: 'действие не найдено' }];
    const bounds = element.getBoundingClientRect();
    const rect = { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
    if (rect.top >= 0 && rect.bottom <= innerHeight) return [];
    return [{ ...finding, rect, message: 'Основное действие вне первого экрана' }];
  }, selector);
}
