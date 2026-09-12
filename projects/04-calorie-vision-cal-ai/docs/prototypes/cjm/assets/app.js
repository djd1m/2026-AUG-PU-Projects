'use strict';
/* Состояние, маршрутизация по хэшу (#A/3), карта пути и панели решения.
   Отрисовка экранов телефона — в assets/screens.js. Зависимостей нет, офлайн. */

(function () {
  const VARIANTS = ['A', 'B', 'C', 'D'];
  const esc = SCREENS.esc;

  const st = { v: 'A', s: 1, portion: 1, srcOpen: false, conflict: false, vis: 'closed', role: 'client' };

  const $ = function (id) { return document.getElementById(id); };

  /* ── маршрут ──────────────────────────────────────────────────── */
  function readHash() {
    const m = /^#([ABCD])\/([1-6])$/.exec(location.hash);
    if (!m) return null;
    return { v: m[1], s: Number(m[2]) };
  }

  function go(v, s, replace) {
    const h = '#' + v + '/' + s;
    if (location.hash === h) { apply(); return; }
    if (replace) location.replace(h); else location.hash = h;
  }

  function apply() {
    const r = readHash() || { v: 'A', s: 1 };
    if (r.v !== st.v || r.s !== st.s) {
      st.portion = 1; st.srcOpen = false; st.conflict = false;
    }
    st.v = r.v; st.s = r.s;
    render();
  }

  /* ── отрисовка ────────────────────────────────────────────────── */
  function render() {
    const flow = FLOWS[st.v];
    VARIANTS.forEach(function (v) {
      const t = $('tab-' + v);
      t.setAttribute('aria-selected', v === st.v ? 'true' : 'false');
      t.tabIndex = v === st.v ? 0 : -1;
    });
    $('stage').setAttribute('aria-labelledby', 'tab-' + st.v);

    $('hero-k').textContent = 'Вариант ' + flow.id + ' из четырёх';
    $('variant-name').textContent = flow.name;
    $('variant-loop').textContent = flow.loop;
    $('variant-aha').textContent = flow.aha;

    renderRail(flow);
    $('screen').innerHTML = SCREENS.render(flow, st.s - 1, st);
    $('screen').scrollTop = 0;
    renderMap(flow);
    document.title = 'Тарелка — вариант ' + flow.id + ', шаг ' + st.s;
  }

  function renderRail(flow) {
    $('rail').innerHTML = CJM_META.map(function (m) {
      const cur = m.step === st.s;
      return '<button type="button" data-step="' + m.step + '"' +
        (cur ? ' aria-current="step"' : '') + '>' +
        '<span class="rail-num" aria-hidden="true">' + m.step + '</span>' +
        '<span><span class="rail-t">' + esc(m.title) + '</span>' +
        '<span class="rail-s">' + m.stage + ' · ' + esc(m.hint) + '</span></span></button>';
    }).join('') + (st.s < 6
      ? '<button type="button" class="pill pill-ghost rail-next" data-action="step-next">Следующий шаг →</button>'
      : '');
  }

  function renderMap(flow) {
    const step = flow.steps[st.s - 1];
    const meta = CJM_META[st.s - 1];
    $('map-stage').textContent = meta.stage + ' · шаг ' + meta.step + ' из 6';

    const growth = step.growth
      ? '<span class="tag tag-accent">FR-GROWTH-' + step.growth + '</span> ' + esc(GROWTH_TEXT[step.growth])
      : '<span class="tag">нет</span> На этом шаге growth-требование не живёт';
    const look = step.look
      ? '<span class="tag">FR-LOOK-' + step.look + '</span> закономерность облика источника'
      : '<span class="tag">нет</span> Шаг не опирается на снятую закономерность';

    $('map-body').innerHTML =
      row('Цель пользователя', esc(step.goal)) +
      row('Трение', esc(step.friction)) +
      row('Паттерн / микро-тренд', esc(step.pattern) + '<span class="map-src">источник: ' + esc(step.patternSrc) + '</span>') +
      row('Где живёт growth-требование', growth) +
      row('Облик', look) +
      row('Гипотеза недели', esc(flow.hypothesis)) +
      row('Сегмент', esc(flow.segment));
  }

  function row(dt, dd) {
    return '<dl class="map-row"><dt>' + dt + '</dt><dd>' + dd + '</dd></dl>';
  }

  /* ── панель сравнения ─────────────────────────────────────────── */
  const CMP_ROWS = [
    ['loop', 'Growth loop'], ['aha', 'Aha Moment'], ['hook', 'Entry Hook'],
    ['paywall', 'Paywall (вне недели)'], ['metric', 'Метрика недели и цель'],
    ['risk', 'Главный риск'], ['reuse', 'Переиспользование N1–N3a']
  ];

  function buildCompare() {
    const head = '<thead><tr><th scope="col">Поле</th>' + VARIANTS.map(function (v) {
      return '<th scope="col">' + v + ' · ' + esc(FLOWS[v].name) + '</th>';
    }).join('') + '</tr></thead>';
    const body = CMP_ROWS.map(function (r) {
      return '<tr><th scope="row">' + r[1] + '</th>' + VARIANTS.map(function (v) {
        return '<td>' + esc(FLOWS[v].compare[r[0]]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    const choose = '<tr class="choose-row"><th scope="row">Решение</th>' + VARIANTS.map(function (v) {
      return '<td><button type="button" class="pill pill-yolk" data-action="choose" data-variant="' + v + '">Выбираю ' + v + '</button></td>';
    }).join('') + '</tr>';
    $('cmp-table').innerHTML = head + '<tbody>' + body + choose + '</tbody>';
  }

  function choose(v) {
    const f = FLOWS[v];
    $('decision-text').value =
      'Выбираю вариант ' + v + ' — ' + f.name + '. Основание: growth loop — ' + f.compare.loop +
      '; Aha — ' + f.compare.aha + '; метрика недели — ' + f.compare.metric +
      '. Принятый риск: ' + f.compare.risk + '.';
    $('copy-note').textContent = '';
  }

  /* ── панель гибрида ───────────────────────────────────────────── */
  function buildBuilder() {
    $('mix-grid').innerHTML = CJM_META.map(function (m) {
      return '<div class="mix-cell"><label for="mix-' + m.step + '">Шаг ' + m.step + ' · ' + esc(m.title) + '</label>' +
        '<select id="mix-' + m.step + '" data-mix="' + m.step + '">' + VARIANTS.map(function (v) {
          return '<option value="' + v + '"' + (v === st.v ? ' selected' : '') + '>' + v + ' — ' + esc(FLOWS[v].name) + '</option>';
        }).join('') + '</select></div>';
    }).join('');
    updateMix();
  }

  function updateMix() {
    const picks = CJM_META.map(function (m) { return { step: m.step, title: m.title, v: $('mix-' + m.step).value }; });
    $('mix-summary').innerHTML = picks.map(function (p) {
      return '<div><b>Шаг ' + p.step + ' · ' + esc(p.title) + '</b> → ' + p.v + ' — ' + esc(FLOWS[p.v].name) + '</div>';
    }).join('');
    const uniq = picks.map(function (p) { return p.v; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    const parts = picks.map(function (p) { return 'шаг ' + p.step + ' «' + p.title + '» из ' + p.v; });
    $('mix-text').value = uniq.length === 1
      ? 'Выбираю вариант ' + uniq[0] + ' — ' + FLOWS[uniq[0]].name +
        '. Основание: все шесть шагов из ' + uniq[0] + '; ведущая growth-петля: ' + FLOWS[uniq[0]].compare.loop + '.'
      : 'Выбираю гибрид ' + uniq.join('+') + '. Основание: ' + parts.join('; ') +
        '. Ведущая growth-петля: ' + FLOWS[picks[5].v].compare.loop + '.';
    $('copy-note-mix').textContent = '';
  }

  /* ── панели: открыть/закрыть ──────────────────────────────────── */
  let lastFocus = null;

  function openSheet(which) {
    lastFocus = document.activeElement;
    if (which === 'compare') buildCompare(); else buildBuilder();
    $('sheet-compare').hidden = which !== 'compare';
    $('sheet-builder').hidden = which !== 'builder';
    $('overlay').hidden = false;
    const s = $(which === 'compare' ? 'sheet-compare' : 'sheet-builder');
    const btn = s.querySelector('[data-action="close"]');
    if (btn) btn.focus();
  }

  function closeSheet() {
    $('overlay').hidden = true;
    $('sheet-compare').hidden = true;
    $('sheet-builder').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function copyFrom(area, note) {
    const el = $(area);
    el.focus(); el.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(el.value).then(function () { $(note).textContent = 'Скопировано'; },
        function () { $(note).textContent = 'Скопируйте вручную: Ctrl+C'; });
      return;
    }
    $(note).textContent = ok ? 'Скопировано' : 'Скопируйте вручную: Ctrl+C';
  }

  /* ── события ──────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    const tab = e.target.closest('[role="tab"]');
    if (tab) { go(tab.dataset.variant, 1); return; }

    const railBtn = e.target.closest('#rail button');
    if (railBtn) { go(st.v, Number(railBtn.dataset.step)); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;

    if (a === 'shutter') { go(st.v, 3); return; }
    if (a === 'step-next') { go(st.v, Math.min(6, st.s + 1)); return; }
    if (a === 'step-pay') { go(st.v, 5); return; }
    if (a === 'portion-inc') { st.portion = Math.min(6, st.portion + 1); render(); return; }
    if (a === 'portion-dec') { st.portion = Math.max(1, st.portion - 1); render(); return; }
    if (a === 'source') { st.srcOpen = !st.srcOpen; render(); return; }
    if (a === 'conflict') { st.conflict = !st.conflict; render(); return; }
    if (a === 'vis') { st.vis = el.dataset.vis; render(); return; }
    if (a === 'role') { st.role = el.dataset.role; render(); return; }
    if (a === 'toggle-map') {
      const map = $('map');
      const off = map.classList.toggle('hidden-body');
      $('stage').classList.toggle('map-off', off);
      el.setAttribute('aria-expanded', off ? 'false' : 'true');
      el.textContent = off ? 'Показать карту' : 'Скрыть карту';
      return;
    }
    if (a === 'open-compare') { openSheet('compare'); return; }
    if (a === 'open-builder') { openSheet('builder'); return; }
    if (a === 'close') { closeSheet(); return; }
    if (a === 'choose') { choose(el.dataset.variant); return; }
    if (a === 'copy') { copyFrom('decision-text', 'copy-note'); return; }
    if (a === 'copy-mix') { copyFrom('mix-text', 'copy-note-mix'); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.mix) updateMix();
  });

  /* клавиатура: стрелки по вкладкам, Esc закрывает панель */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('overlay').hidden) { closeSheet(); return; }
    const tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab) return;
    const i = VARIANTS.indexOf(tab.dataset.variant);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % 4;
    if (e.key === 'ArrowLeft') n = (i + 3) % 4;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = 3;
    if (n < 0) return;
    e.preventDefault();
    const next = $('tab-' + VARIANTS[n]);
    next.focus();
    go(VARIANTS[n], 1);
  });

  document.addEventListener('click', function (e) {
    if (e.target === $('overlay')) closeSheet();
  });

  window.addEventListener('hashchange', apply);

  if (!readHash()) go('A', 1, true);
  apply();
})();
