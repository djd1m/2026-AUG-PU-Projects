'use strict';
/* Экраны телефона. Отрисовка шести экранов; состояние и маршрут — в app.js; блюда — в food.js. */

const SCREENS = (function () {

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function macros(portions) {
    const g = DEMO.portionG * portions;
    const k = DEMO.per100;
    return { grams: g, kcal: Math.round(k.kcal * g / 100), prot: Math.round(k.prot * g / 100),
      fat: Math.round(k.fat * g / 100), carb: Math.round(k.carb * g / 100) };
  }

  /* 1 — Вход */
  function entry(flow, sc) {
    let media;
    if (sc.media === 'reel') {
      media = FOOD.svg('syrniki') + '<span class="entry-play" aria-hidden="true">▶</span>' +
        '<p class="entry-title">' + esc(sc.title) + '</p>';
    } else if (sc.media === 'chat') {
      media = '<div class="entry-chat"><span class="bubble">' + esc(sc.lines[0]) + '</span>' +
        '<span class="bubble bubble-me">мой обед — фото ↓</span>' +
        '<span class="bubble"><b>' + esc(sc.title) + '</b></span></div>';
    } else if (sc.media === 'invite') {
      media = FOOD.svg('salad') + '<p class="entry-title">' + esc(sc.title) + '</p>';
    } else {
      media = '<span class="entry-code">' + esc(sc.title) + '</span>';
    }
    return '<div class="scr scr-entry">' +
      '<div class="entry-media"><span class="entry-badge">' + esc(sc.badge) + '</span>' + media + '</div>' +
      '<div class="card">' + sc.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>' +
      '<button type="button" class="p-pill p-pill-dark p-pill-wide" data-action="step-next">' + esc(sc.cta) + '</button>' +
      '<p class="scr-sub">' + esc(sc.note) + '</p>' +
      '</div>';
  }

  /* 2 — Камера (FR-LOOK-006) */
  function camera() {
    const modes = [['Скан еды', true], ['Штрихкод', false], ['Галерея', false], ['Голосом', false], ['Вручную', false]]
      .map(function (m) {
        return '<button type="button" aria-pressed="' + (m[1] ? 'true' : 'false') + '"' +
          (m[1] ? '' : ' aria-disabled="true" title="вне недели"') + '>' + esc(m[0]) + '</button>';
      }).join('');
    return '<div class="scr scr-camera">' +
      '<div class="cam-view">' + FOOD.svg(DEMO.food) + '<div class="cam-vignette"></div>' +
        '<div class="cam-top"><span>Сканер</span><span>анкеты нет</span></div>' +
        '<div class="cam-frame"><i></i><i></i><i></i><i></i><span class="cam-scan"></span></div>' +
        '<p class="cam-hint">Наведите на тарелку и нажмите кнопку</p></div>' +
      '<div class="cam-bottom"><div class="cam-modes">' + modes + '</div>' +
        '<button type="button" class="shutter" data-action="shutter" aria-label="Снять кадр"></button>' +
        '<p class="scr-sub" style="color:rgba(251,248,242,.5)">штрихкод, голос и ручной ввод — вне недели</p>' +
      '</div></div>';
  }

  /* 3 — Результат / Aha (FR-LOOK-007, FR-LOOK-012, FR-GROWTH-001) */
  function result(flow, sc, st) {
    const m = macros(st.portion);
    const chips = DEMO.chips.map(function (c) {
      return '<span class="ing-chip" style="left:' + c.x + '%;top:' + c.y + '%">' + esc(c.label) + ' · ' + c.g + ' г</span>';
    }).join('');
    const src = DEMO.source;
    const tiles =
      '<div class="tile tile-kcal"><div><div class="tile-v" id="kcal-value">' + m.kcal + '</div><div class="tile-l">ккал</div></div>' +
        '<span class="tile-src">из базы · ' + esc(src.id) + '</span></div>' +
      '<div class="tile"><div class="tile-v">' + m.prot + ' г</div><div class="tile-l">белки</div></div>' +
      '<div class="tile"><div class="tile-v">' + m.fat + ' г</div><div class="tile-l">жиры</div></div>' +
      '<div class="tile"><div class="tile-v">' + m.carb + ' г</div><div class="tile-l">углеводы</div></div>';
    const srcOpen = st.srcOpen
      ? '<div class="src-row"><b>' + esc(src.name) + '</b> · id ' + esc(src.id) + '<br>' + esc(src.row) + '<br>' +
        esc(src.updated) + ' · ' + esc(src.licence) + '<br>порция ' + m.grams + ' г → ' + m.kcal + ' ккал</div>'
      : '';
    const cf = DEMO.conflict;
    const conflict = st.conflict
      ? '<div class="conflict"><p class="conflict-q">Модель: ~' + Math.round(cf.model * st.portion) + ' ккал · База: ' +
          Math.round(cf.base * st.portion) + ' ккал — ' + esc(cf.question) + '</p>' +
        '<div class="conflict-opts"><button type="button" class="p-pill">Как у модели</button>' +
          '<button type="button" class="p-pill p-pill-dark">Как в базе</button></div>' +
        '<p class="conflict-note">Выбор пользователя, а не тихое усреднение (FR-LOOK-012)</p></div>'
      : '';
    return '<div class="scr scr-result">' +
      '<div class="res-photo">' + FOOD.svg(DEMO.food) + chips + '</div>' +
      '<div class="card" style="display:grid;gap:10px">' +
        '<p class="scr-sub">' + esc(DEMO.meal) + '</p>' +
        '<h3 class="res-name">' + esc(DEMO.dish) + '</h3>' +
        '<div class="stepper"><button type="button" data-action="portion-dec" aria-label="Меньше порций">−</button>' +
          '<span class="stepper-val" id="portion-value">' + st.portion + '<span class="stepper-g"> · ' + m.grams + ' г</span></span>' +
          '<button type="button" data-action="portion-inc" aria-label="Больше порций">+</button></div>' +
        '<div class="tiles">' + tiles + '</div>' +
        '<button type="button" class="src-chip" data-action="source" aria-expanded="' + (st.srcOpen ? 'true' : 'false') + '">' +
          '<b>ИСТОЧНИК</b> ' + esc(src.chip) + ' — откуда число</button>' + srcOpen +
        '<button type="button" class="p-pill p-pill-tiny" data-action="conflict" aria-pressed="' + (st.conflict ? 'true' : 'false') + '">' +
          (st.conflict ? 'скрыть расхождение' : 'показать расхождение модели и базы') + '</button>' + conflict +
        '<div class="res-actions"><button type="button" class="p-pill">✦ Исправить</button>' +
          '<button type="button" class="p-pill p-pill-dark">Готово</button></div>' +
      '</div>' + share(flow, m) + '</div>';
  }

  /* Share-CTA под результатом — FR-GROWTH-001 */
  function share(flow, m) {
    const extra = flow.id === 'D' ? ' · код MYCODE7' : '';
    return '<div class="share" id="share-cta">' +
      '<div class="share-row">' +
        '<div class="share-card" aria-hidden="true"><small>' + esc(DEMO.dish.split(' ')[0]) + '</small>' + FOOD.svg(DEMO.food) +
          '<div><b>' + m.kcal + '</b> <small>ккал</small><div class="share-badge">распознано в Тарелке' + extra + '</div></div></div>' +
        '<div><p class="share-t">Карточка 9:16 готова</p>' +
          '<p class="scr-sub">Без правок: фото, число и бейдж уже на месте</p>' +
          '<p class="fr-tag">FR-GROWTH-001 · share-CTA на экране первого результата</p></div>' +
      '</div>' +
      '<button type="button" class="p-pill p-pill-yolk p-pill-wide">Поделиться карточкой</button></div>';
  }

  /* 4 — Дневник / Core loop */
  function diary(flow, sc, st) {
    const d = DEMO.diary;
    const rows = d.rows.map(function (r) {
      return '<div class="day-row"><span class="day-thumb">' + FOOD.svg(r.food) + '</span>' +
        '<span class="day-name">' + esc(r.name) + '<br><span class="day-when">' + r.when + '</span></span>' +
        '<span class="day-kcal">' + r.kcal + '</span></div>';
    }).join('');
    const base = '<div class="card">' +
        '<p class="scr-sub">Сегодня · 12 сентября</p>' +
        '<p class="day-total"><b>' + d.total + '</b> <span class="scr-sub">из ' + d.goal + ' ккал</span></p>' +
        '<div class="bar" style="margin:8px 0"><i style="width:' + Math.round(d.total / d.goal * 100) + '%"></i></div>' +
        '<div class="macros">' +
          '<div><div class="macro-v">' + d.prot + ' г</div><div class="macro-l">белки</div></div>' +
          '<div><div class="macro-v">' + d.fat + ' г</div><div class="macro-l">жиры</div></div>' +
          '<div><div class="macro-v">' + d.carb + ' г</div><div class="macro-l">углеводы</div></div></div></div>' +
      '<div class="card">' + rows + '</div>' +
      '<div class="card"><p>Белок: <b>' + d.prot + '</b> из ' + d.protGoal + ' г</p>' +
        '<div class="bar bar-ok" style="margin-top:8px"><i style="width:' + Math.round(d.prot / d.protGoal * 100) + '%"></i></div></div>';
    return '<div class="scr scr-diary">' + base + diaryExtra(flow, sc, st) + '</div>';
  }

  function diaryExtra(flow, sc, st) {
    const d = DEMO.diary;
    if (sc.extra === 'streak') {
      const days = [1, 1, 1, 1, 0, 0, 0].map(function (on) { return '<i class="' + (on ? 'on' : '') + '"></i>'; }).join('');
      return '<div class="card card-dark"><p><b>' + d.streak + ' дня подряд</b> с логом</p>' +
        '<div class="streak">' + days + '</div><p class="scr-sub" style="margin-top:8px">Мягкий стрик: не сгорает от одного пропуска</p></div>';
    }
    if (sc.extra === 'visibility') {
      const seg = [['closed', 'Закрыта'], ['link', 'По ссылке'], ['public', 'Публичная']].map(function (o) {
        return '<button type="button" data-action="vis" data-vis="' + o[0] + '" aria-pressed="' + (st.vis === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('');
      const consent = st.vis === 'closed'
        ? 'По умолчанию закрыто. Данные о питании — специальная категория ПДн (152-ФЗ ст.10).'
        : 'Требуется явное согласие на публикацию данных о питании как данных о здоровье. Согласие отзывается в один клик.';
      return '<div class="card"><p style="font-weight:600;margin-bottom:8px">Страница дня</p><div class="seg">' + seg + '</div>' +
        '<p class="consent" style="margin-top:8px">' + esc(consent) + '</p>' +
        '<p class="fr-tag">FR-GROWTH-006 (предложение) · согласие ДО публикации</p></div>';
    }
    if (sc.extra === 'roles') {
      const seg = [['client', 'Клиент'], ['coach', 'Тренер']].map(function (o) {
        return '<button type="button" data-action="role" data-role="' + o[0] + '" aria-pressed="' + (st.role === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('');
      const body = st.role === 'coach'
        ? '<p style="font-weight:600;margin:10px 0 2px">Все клиенты сегодня</p>' +
          [['Анна', true], ['Пётр', true], ['Лиза', true], ['Олег', false], ['Ким', false]].map(function (c) {
            return '<div class="coach-row"><span class="dot ' + (c[1] ? 'dot-ok' : 'dot-no') + '"></span><span style="flex:1">' + c[0] +
              '</span><span class="day-when">' + (c[1] ? 'дневник заполнен' : 'нет записей') + '</span></div>';
          }).join('')
        : '<p style="margin:10px 0 4px">Тренер Иван поставил 👍 на завтрак</p>' +
          '<p class="consent">Передача данных тренеру — только по явному согласию клиента.</p>';
      return '<div class="card"><div class="seg">' + seg + '</div>' + body + '</div>';
    }
    if (sc.extra === 'bonus') {
      return '<div class="card card-dark"><p><b>Бонус от @blogger:</b> 30 сканов, 13 дней</p>' +
        '<div class="bar bar-yolk" style="margin:8px 0;background:rgba(251,248,242,.14)"><i style="width:57%"></i></div>' +
        '<p class="scr-sub">До собственного кода: 4 дня стрика из 7</p></div>';
    }
    return '';
  }

  /* 5 — Paywall (вне недели) */
  function paywall(flow, sc) {
    const modes = {
      scans: { big: 'Лимит 10 сканов на сегодня', sub: 'Завтра лимит обнулится. Дневной лимит — требование стоимости внешних вызовов, не тариф.', cta: 'Оставить почту' },
      badge: { big: 'Снять бейдж со страницы', sub: 'Скрыть бейдж и закрыть страницу паролем — платные опции.', cta: 'Оставить почту' },
      seats: { big: 'Мест для клиентов: 5 из 5', sub: 'Тариф тренера обсуждается отдельно: оставьте заявку, с вами свяжутся.', cta: 'Оставить заявку' },
      bonus: { big: 'Бонусные сканы закончились', sub: 'Промо-цена для когорты @blogger будет предложена при запуске Pro.', cta: 'Оставить почту' }
    };
    const m = modes[sc.mode];
    return '<div class="scr scr-pay">' +
      '<div class="card card-dark" style="padding:22px"><p class="pay-big">' + esc(m.big) + '</p>' +
        '<p class="scr-sub" style="margin-top:10px">' + esc(m.sub) + '</p></div>' +
      '<div class="card"><h3>Pro скоро</h3>' +
        '<p class="scr-sub" style="margin:8px 0 12px">Экран интереса: измеряем, сколько людей упираются в лимит и оставляют контакт.</p>' +
        '<div class="pay-field"><input type="email" placeholder="почта" aria-label="Почта">' +
          '<button type="button" class="p-pill p-pill-dark">' + esc(m.cta) + '</button></div></div>' +
      '<p class="pay-note">Подписки в неделе нет — это экран интереса, а не оплата.</p></div>';
  }

  /* 6 — Рост */
  function growth(flow, sc) {
    const g = GROWTH_DATA[sc.mode];
    if (sc.mode === 'cards') {
      return '<div class="scr">' +
        '<div class="card card-dark"><div class="stat"><span class="stat-v">' + g.share + '</span>' +
          '<span class="scr-sub">' + g.shares + ' из ' + g.activated + ' активированных расшерили ≥1 карточку</span></div></div>' +
        '<div class="card"><p class="code-box">' + g.code + '</p><p class="scr-sub" style="text-align:center;margin-top:6px">персональный код блогера</p></div>' +
        '<div class="card"><p style="font-weight:600;margin-bottom:8px">Когорта кода</p>' +
          funnel([['установки', g.installs, 100], ['активации', g.activations, 60], ['шеринги', g.shares, 32]]) +
          '<p class="fr-tag">FR-GROWTH-004 · дашборд когорты по коду</p></div></div>';
    }
    if (sc.mode === 'daypage') {
      const rows = DEMO.diary.rows.map(function (r) {
        return '<div class="day-row"><span class="day-thumb">' + FOOD.svg(r.food) + '</span><span class="day-name">' + esc(r.name) + '</span><span class="day-kcal">' + r.kcal + '</span></div>';
      }).join('');
      return '<div class="scr">' +
        '<div class="card"><p class="scr-sub">' + esc(g.url) + '</p><h3 style="margin:6px 0 10px">Мой день в тарелках</h3>' + rows +
          '<p class="fr-tag">бейдж «' + esc(g.badge) + '» внизу страницы</p></div>' +
        '<div class="card"><div class="kv"><span>просмотров страницы</span><span>' + g.views + '</span></div>' +
          '<div class="kv"><span>установок с неё</span><span>' + g.installs + '</span></div>' +
          '<p class="consent" style="margin-top:8px">Показы ≠ установки: это главный риск варианта B.</p></div>' +
        '<button type="button" class="p-pill p-pill-wide" data-action="step-pay">Снять бейдж → Pro скоро</button></div>';
    }
    if (sc.mode === 'coach') {
      return '<div class="scr">' +
        '<div class="card"><p class="code-box">' + g.code + '</p><p class="scr-sub" style="text-align:center;margin-top:6px">код тренера (N1 partner.ts: читаемый код + fraud-окно)</p></div>' +
        '<div class="card"><div class="qr" role="img" aria-label="QR группы тренера"></div>' +
          '<p class="scr-sub" style="text-align:center;margin-top:8px">QR группы: клиент сканирует на тренировке</p></div>' +
        '<div class="card"><div class="kv"><span>клиентов в группе</span><span>' + g.clients + '</span></div>' +
          '<div class="kv"><span>с дневником 3+ дня</span><span>' + g.active3d + '</span></div>' +
          '<div class="kv"><span>приглашений отправлено</span><span>' + g.invites + '</span></div>' +
          '<p class="fr-tag">FR-GROWTH-004 · код тренера = партнёрский код</p></div></div>';
    }
    return '<div class="scr">' +
      '<div class="card"><p style="font-weight:600;margin-bottom:8px">Кабинет партнёра</p>' +
        funnel([['клики', g.clicks, 100], ['установки', g.installs, 31], ['активации', g.activations, 19], ['pending-оплаты', g.pending, 19]]) + '</div>' +
      '<div class="card"><div class="kv"><span>реестр выплат</span><span>' + esc(g.payout) + '</span></div>' +
        '<p class="consent" style="margin-top:8px">Оплат в неделе нет: вознаграждение помечено pending до подтверждённого события.</p></div>' +
      '<div class="card"><p style="font-weight:600;margin-bottom:8px">Ввести код</p>' +
        '<div class="pay-field"><input type="text" placeholder="BLOGGER30" aria-label="Код блогера"><button type="button" class="p-pill p-pill-dark">Применить</button></div>' +
        '<p class="consent" style="margin-top:8px">Явный код сильнее cookie. Недействительный код не откатывается к cookie — пользователь видит ошибку.</p>' +
        '<p class="fr-tag">FR-GROWTH-002 · атрибуция до платной конверсии</p></div></div>';
  }

  function funnel(rows) {
    return '<div class="funnel">' + rows.map(function (r) {
      return '<div class="funnel-row"><span class="macro-l">' + esc(r[0]) + '</span><span class="bar"><i style="width:' + r[2] + '%"></i></span>' +
        '<span class="funnel-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  return {
    render: function (flow, stepIndex, st) {
      const sc = flow.steps[stepIndex].screen;
      if (sc.kind === 'entry') return entry(flow, sc);
      if (sc.kind === 'camera') return camera();
      if (sc.kind === 'result') return result(flow, sc, st);
      if (sc.kind === 'diary') return diary(flow, sc, st);
      if (sc.kind === 'paywall') return paywall(flow, sc);
      return growth(flow, sc);
    },
    esc: esc, macros: macros
  };
})();
