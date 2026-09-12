'use strict';
/* Экраны телефона. Разделено с app.js по правилу репозитория «файл < 500 строк»:
   здесь только отрисовка шести экранов, состояние и маршрутизация — в app.js. */

const SCREENS = (function () {

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Пересчёт четырёх плиток от числа порций. */
  function macros(portions) {
    const g = DEMO.portionG * portions;
    const k = DEMO.per100;
    return {
      grams: g,
      kcal: Math.round(k.kcal * g / 100),
      prot: Math.round(k.prot * g / 100),
      fat: Math.round(k.fat * g / 100),
      carb: Math.round(k.carb * g / 100)
    };
  }

  /* 1 — Вход */
  function entry(flow, sc) {
    const media = sc.media === 'code'
      ? '<span class="entry-code">' + esc(sc.title) + '</span>'
      : '<span aria-hidden="true">' + (sc.media === 'chat' ? '💬' : sc.media === 'invite' ? '🤝' : '▶️') + '</span>';
    const head = sc.media === 'code' ? '' : '<h3>' + esc(sc.title) + '</h3>';
    return '<div class="scr scr-entry">' +
      '<div class="entry-media"><span class="entry-badge">' + esc(sc.badge) + '</span>' + media + '</div>' +
      '<div class="card">' + head +
        sc.lines.map(function (l) { return '<p class="scr-sub">' + esc(l) + '</p>'; }).join('') +
      '</div>' +
      '<button type="button" class="pill pill-dark" data-action="step-next" style="justify-content:center">' + esc(sc.cta) + '</button>' +
      '<p class="scr-sub">' + esc(sc.note) + '</p>' +
      '</div>';
  }

  /* 2 — Камера (FR-LOOK-006) */
  function camera() {
    const modes = [
      { t: 'Скан еды', on: true },
      { t: 'Штрихкод', on: false },
      { t: 'Галерея', on: false },
      { t: 'Вручную', on: false }
    ].map(function (m) {
      return '<button type="button" class="pill' + (m.on ? ' pill-dark' : '') + '"' +
        (m.on ? '' : ' aria-disabled="true" title="вне недели"') + '>' + esc(m.t) + '</button>';
    }).join('');
    return '<div class="scr scr-camera">' +
      '<div class="cam-view"><div class="cam-frame"></div>' +
        '<span class="cam-dish" aria-hidden="true">' + DEMO.emoji + '</span>' +
        '<p class="cam-hint">Наведите на тарелку · анкеты нет</p></div>' +
      '<div class="cam-modes">' + modes + '</div>' +
      '<div class="shutter-wrap">' +
        '<button type="button" class="shutter" data-action="shutter" aria-label="Снять кадр"></button>' +
        '<p class="scr-sub">штрихкод, галерея и ручной ввод — вне недели</p>' +
      '</div></div>';
  }

  /* 3 — Результат / Aha (FR-LOOK-007, FR-LOOK-012, FR-GROWTH-001) */
  function result(flow, sc, st) {
    const m = macros(st.portion);
    const chips = DEMO.chips.map(function (c) {
      return '<span class="ing-chip" style="left:' + c.x + '%;top:' + c.y + '%">' +
        esc(c.label) + ' · ' + c.g + ' г</span>';
    }).join('');

    const tiles =
      '<div class="tile tile-kcal"><div class="tile-ico" aria-hidden="true">🔥</div>' +
        '<div class="tile-v" id="kcal-value">' + m.kcal + '</div><div class="tile-l">ккал</div></div>' +
      '<div class="tile"><div class="tile-ico" aria-hidden="true">🥚</div>' +
        '<div class="tile-v">' + m.prot + ' г</div><div class="tile-l">белки</div></div>' +
      '<div class="tile"><div class="tile-ico" aria-hidden="true">🧈</div>' +
        '<div class="tile-v">' + m.fat + ' г</div><div class="tile-l">жиры</div></div>' +
      '<div class="tile"><div class="tile-ico" aria-hidden="true">🌾</div>' +
        '<div class="tile-v">' + m.carb + ' г</div><div class="tile-l">углеводы</div></div>';

    const src = DEMO.source;
    const srcOpen = st.srcOpen
      ? '<div class="src-row"><b>' + esc(src.name) + '</b> · id ' + esc(src.id) + '<br>' +
        esc(src.row) + '<br>' + esc(src.updated) + ' · ' + esc(src.licence) + '<br>' +
        'порция ' + m.grams + ' г → ' + m.kcal + ' ккал</div>'
      : '';

    const cf = DEMO.conflict;
    const conflict = st.conflict
      ? '<div class="conflict"><p class="conflict-q">Модель: ~' + Math.round(cf.model * st.portion) +
          ' ккал · База: ' + Math.round(cf.base * st.portion) + ' ккал — ' + esc(cf.question) + '</p>' +
        '<div class="conflict-opts">' +
          '<button type="button" class="pill">Как у модели</button>' +
          '<button type="button" class="pill pill-dark">Как в базе</button></div>' +
        '<p class="conflict-note">Выбор пользователя, а не тихое усреднение (FR-LOOK-012)</p></div>'
      : '';

    return '<div class="scr scr-result">' +
      '<div class="res-photo"><span class="plate" aria-hidden="true">' +
        '<span class="plate-food">' + DEMO.emoji + '</span></span>' + chips + '</div>' +
      '<div class="card">' +
        '<p class="scr-sub">' + esc(DEMO.meal) + '</p>' +
        '<h3 class="res-name">' + esc(DEMO.dish) + '</h3>' +
        '<div class="stepper" style="margin:12px 0">' +
          '<button type="button" data-action="portion-dec" aria-label="Меньше порций">−</button>' +
          '<span class="stepper-val" id="portion-value">' + st.portion +
            '<span class="stepper-g"> · ' + m.grams + ' г</span></span>' +
          '<button type="button" data-action="portion-inc" aria-label="Больше порций">+</button>' +
        '</div>' +
        '<div class="tiles">' + tiles + '</div>' +
        '<div style="display:grid;gap:8px;margin-top:12px">' +
          '<button type="button" class="src-chip" data-action="source" aria-expanded="' + (st.srcOpen ? 'true' : 'false') + '">' +
            '📖 ' + esc(src.chip) + ' — откуда число</button>' + srcOpen +
          '<button type="button" class="pill pill-tiny" data-action="conflict" aria-pressed="' + (st.conflict ? 'true' : 'false') + '">' +
            'показать расхождение</button>' + conflict +
        '</div>' +
        '<div class="res-actions" style="margin-top:12px">' +
          '<button type="button" class="pill">✦ Исправить</button>' +
          '<button type="button" class="pill pill-dark">Готово</button>' +
        '</div>' +
      '</div>' + share(flow) + '</div>';
  }

  /* Share-CTA под результатом — FR-GROWTH-001 */
  function share(flow) {
    const extra = flow.id === 'D' ? '<span class="share-badge">код MYCODE7</span>' : '';
    return '<div class="share" id="share-cta">' +
      '<div class="share-row">' +
        '<div class="share-preview"><b>540</b><span>ккал</span>' +
          '<span aria-hidden="true">' + DEMO.emoji + '</span>' +
          '<span class="share-badge">распознано в Тарелке</span>' + extra + '</div>' +
        '<div><p style="font-size:14px;line-height:20px;font-weight:600">Карточка 9:16 готова</p>' +
          '<p class="scr-sub">Без правок: фото, число и бейдж уже на месте</p>' +
          '<p class="fr-tag">FR-GROWTH-001 · share-CTA на экране первого результата</p></div>' +
      '</div>' +
      '<button type="button" class="pill pill-accent" style="justify-content:center">Поделиться карточкой</button>' +
      '</div>';
  }

  /* 4 — Дневник / Core loop */
  function diary(flow, sc, st) {
    const d = DEMO.diary;
    const rows = d.rows.map(function (r) {
      return '<div class="day-row"><span class="day-emoji" aria-hidden="true">' + r.emoji + '</span>' +
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
          '<div><div class="macro-v">' + d.carb + ' г</div><div class="macro-l">углеводы</div></div>' +
        '</div></div>' +
      '<div class="card">' + rows + '</div>' +
      '<div class="card"><p style="font-size:14px;line-height:20px">Белок: ' + d.prot + ' из ' + d.protGoal + ' г</p>' +
        '<div class="bar bar-ok" style="margin-top:8px"><i style="width:' +
          Math.round(d.prot / d.protGoal * 100) + '%"></i></div></div>';

    return '<div class="scr scr-diary">' + base + diaryExtra(flow, sc, st) + '</div>';
  }

  function diaryExtra(flow, sc, st) {
    const d = DEMO.diary;
    if (sc.extra === 'streak') {
      return '<div class="card card-dark"><p style="font-size:14px">🔥 ' + d.streak +
        ' дня подряд с логом</p><p class="scr-sub">Мягкий стрик: не сгорает от одного пропуска</p></div>';
    }
    if (sc.extra === 'visibility') {
      const opts = [['closed', 'Закрыта'], ['link', 'По ссылке'], ['public', 'Публичная']];
      const seg = opts.map(function (o) {
        return '<button type="button" data-action="vis" data-vis="' + o[0] + '" aria-pressed="' +
          (st.vis === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('');
      const consent = st.vis === 'closed'
        ? 'По умолчанию закрыто. Данные о питании — специальная категория ПДн (152-ФЗ ст.10).'
        : 'Требуется явное согласие на публикацию данных о питании как данных о здоровье. Согласие отзывается в один клик.';
      return '<div class="card"><p style="font-size:14px;font-weight:600;margin-bottom:8px">Страница дня</p>' +
        '<div class="seg">' + seg + '</div>' +
        '<p class="consent" style="margin-top:8px">' + esc(consent) + '</p>' +
        '<p class="fr-tag">FR-GROWTH-006 (предложение) · согласие ДО публикации</p></div>';
    }
    if (sc.extra === 'roles') {
      const seg = [['client', 'Клиент'], ['coach', 'Тренер']].map(function (o) {
        return '<button type="button" data-action="role" data-role="' + o[0] + '" aria-pressed="' +
          (st.role === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('');
      const body = st.role === 'coach'
        ? '<p style="font-size:14px;font-weight:600;margin:8px 0">Все клиенты сегодня</p>' +
          [['Анна', true], ['Пётр', true], ['Лиза', true], ['Олег', false], ['Ким', false]].map(function (c) {
            return '<div class="coach-row"><span class="dot ' + (c[1] ? 'dot-ok' : 'dot-no') + '"></span>' +
              '<span style="flex:1">' + c[0] + '</span><span class="day-when">' +
              (c[1] ? 'дневник заполнен' : 'нет записей') + '</span></div>';
          }).join('')
        : '<p style="font-size:14px;margin:8px 0">Тренер Иван поставил 👍 на завтрак</p>' +
          '<p class="consent">Передача данных тренеру — только по явному согласию клиента.</p>';
      return '<div class="card"><div class="seg">' + seg + '</div>' + body + '</div>';
    }
    if (sc.extra === 'bonus') {
      return '<div class="card card-dark"><p style="font-size:14px">🎁 Бонус от @blogger: 30 сканов, 13 дней</p>' +
        '<div class="bar" style="margin:8px 0;background:#3A3342"><i style="width:57%;background:#E4572E"></i></div>' +
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
      '<div class="card card-dark" style="padding:24px">' +
        '<p class="pay-big">' + esc(m.big) + '</p>' +
        '<p class="scr-sub" style="margin-top:8px">' + esc(m.sub) + '</p>' +
      '</div>' +
      '<div class="card"><p style="font-size:20px;line-height:28px;font-weight:600">Pro скоро</p>' +
        '<p class="scr-sub" style="margin:8px 0 12px">Экран интереса: измеряем, сколько людей упираются в лимит и оставляют контакт.</p>' +
        '<div class="pay-field"><input type="email" placeholder="почта" aria-label="Почта">' +
          '<button type="button" class="pill pill-dark">' + esc(m.cta) + '</button></div>' +
      '</div>' +
      '<p class="pay-note">⚠ Подписки в неделе НЕТ — это экран интереса, а не оплата.</p>' +
      '</div>';
  }

  /* 6 — Рост */
  function growth(flow, sc) {
    const g = GROWTH_DATA[sc.mode];
    if (sc.mode === 'cards') {
      return '<div class="scr">' +
        '<div class="card"><p style="font-size:14px;font-weight:600">Карточка ушла в сторис</p>' +
          '<p class="scr-sub">' + g.shares + ' из ' + g.activated + ' активированных расшерили ≥1 карточку — ' + g.share + '</p></div>' +
        '<div class="card"><p class="code-box">' + g.code + '</p>' +
          '<p class="scr-sub" style="text-align:center">персональный код блогера</p></div>' +
        '<div class="card"><p style="font-size:14px;font-weight:600;margin-bottom:8px">Когорта кода</p>' +
          funnel([['установки', g.installs, 100], ['активации', g.activations, 60], ['шеринги', g.shares, 32]]) +
          '<p class="fr-tag">FR-GROWTH-004 · дашборд когорты по коду</p></div>' +
        '</div>';
    }
    if (sc.mode === 'daypage') {
      return '<div class="scr">' +
        '<div class="card"><p class="scr-sub">' + esc(g.url) + '</p>' +
          '<p style="font-size:20px;line-height:28px;font-weight:600;margin:8px 0">Мой день в тарелках</p>' +
          '<div class="day-row"><span class="day-emoji">🥞</span><span class="day-name">Сырники</span><span class="day-kcal">540</span></div>' +
          '<div class="day-row"><span class="day-emoji">🥗</span><span class="day-name">Салат с тунцом</span><span class="day-kcal">430</span></div>' +
          '<div class="day-row"><span class="day-emoji">🍝</span><span class="day-name">Паста болоньезе</span><span class="day-kcal">870</span></div>' +
          '<p class="fr-tag" style="margin-top:8px">бейдж «' + esc(g.badge) + '» внизу страницы</p></div>' +
        '<div class="card"><div class="kv"><span>просмотров страницы</span><span>' + g.views + '</span></div>' +
          '<div class="kv"><span>установок с неё</span><span>' + g.installs + '</span></div>' +
          '<p class="consent">Показы ≠ установки: это главный риск варианта B.</p></div>' +
        '<button type="button" class="pill" style="justify-content:center" data-action="step-pay">Снять бейдж → Pro скоро</button>' +
        '</div>';
    }
    if (sc.mode === 'coach') {
      return '<div class="scr">' +
        '<div class="card"><p class="code-box">' + g.code + '</p>' +
          '<p class="scr-sub" style="text-align:center">код тренера (N1 partner.ts: читаемый код + fraud-окно)</p></div>' +
        '<div class="card"><div class="qr" role="img" aria-label="QR группы тренера"></div>' +
          '<p class="scr-sub" style="text-align:center;margin-top:8px">QR группы: клиент сканирует на тренировке</p></div>' +
        '<div class="card"><div class="kv"><span>клиентов в группе</span><span>' + g.clients + '</span></div>' +
          '<div class="kv"><span>с дневником 3+ дня</span><span>' + g.active3d + '</span></div>' +
          '<div class="kv"><span>приглашений отправлено</span><span>' + g.invites + '</span></div>' +
          '<p class="fr-tag">FR-GROWTH-004 · код тренера = партнёрский код</p></div>' +
        '</div>';
    }
    return '<div class="scr">' +
      '<div class="card"><p style="font-size:14px;font-weight:600;margin-bottom:8px">Кабинет партнёра</p>' +
        funnel([['клики', g.clicks, 100], ['установки', g.installs, 31], ['активации', g.activations, 19], ['pending-оплаты', g.pending, 19]]) +
      '</div>' +
      '<div class="card"><div class="kv"><span>реестр выплат</span><span>' + esc(g.payout) + '</span></div>' +
        '<p class="consent">Оплат в неделе нет: вознаграждение помечено pending до подтверждённого события.</p></div>' +
      '<div class="card"><p style="font-size:14px;font-weight:600;margin-bottom:8px">Ввести код</p>' +
        '<div class="pay-field"><input type="text" placeholder="BLOGGER30" aria-label="Код блогера">' +
          '<button type="button" class="pill pill-dark">Применить</button></div>' +
        '<p class="consent" style="margin-top:8px">Явный код сильнее cookie. Недействительный код НЕ откатывается к cookie — пользователь видит ошибку.</p>' +
        '<p class="fr-tag">FR-GROWTH-002 · атрибуция до платной конверсии</p></div>' +
      '</div>';
  }

  function funnel(rows) {
    return '<div class="funnel">' + rows.map(function (r) {
      return '<div class="funnel-row"><span style="min-width:104px" class="macro-l">' + esc(r[0]) + '</span>' +
        '<span class="bar"><i style="width:' + r[2] + '%"></i></span>' +
        '<span class="funnel-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  return {
    render: function (flow, stepIndex, st) {
      const step = flow.steps[stepIndex];
      const sc = step.screen;
      if (sc.kind === 'entry') return entry(flow, sc);
      if (sc.kind === 'camera') return camera();
      if (sc.kind === 'result') return result(flow, sc, st);
      if (sc.kind === 'diary') return diary(flow, sc, st);
      if (sc.kind === 'paywall') return paywall(flow, sc);
      return growth(flow, sc);
    },
    esc: esc,
    macros: macros
  };
})();
