// Страницы кабинета. Тот же приём, что у гостя: SSR-строки, ноль клиентского JS в MVP,
// экранирование в одном месте, токены дизайн-системы оригинала.

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const CSS = `
/* Система облика владельческих поверхностей. Источник — снимки Birdeye в
   docs/discovery/screenshots (решение владельца от 02.09.2026, см. source-product-profile.md).
   Переносятся РЕГУЛЯРНОСТИ: ширина полосы, шкала кегля, ритм отбивок, форма элемента управления,
   структура полосы с числами. Цвета остаются НАШИ: чужой фирменный синий вместе с именем и знаком
   образует товарный знак, а измерение — не лицензия.

   Гостевая поверхность СЮДА НЕ ВХОДИТ и остаётся на прежней системе: её облик связан
   инвариантами (побайтовая чистота ответа T4, запрет веб-шрифта ADR-010), и переодевание
   сломало бы то, чем доказывается её чистота. */
:root{
--ink:#10202f;--text:#4d5866;--muted:#7b8794;
--brand:#025bde;--brand-dk:#0246ab;--brand-soft:#eaf2ff;
--band:#f4f6f8;--line:#e2e6eb;--ok:#1a9c5b;
--err:#a3231e;--err-soft:#ffe9e8;--warn:#7a4a00;--warn-soft:#fdeed6;
--r:10px;--r-card:16px;--r-media:24px;--wrap:1120px}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--text);
font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
-webkit-font-smoothing:antialiased}
a{color:var(--brand)}

/* ── полосы во всю ширину, содержимое в общей колонке */
.band{padding:64px 20px}
.band--tint{background:var(--band)}
.band--tight{padding:36px 20px}
.wrap{max-width:var(--wrap);margin:0 auto}
.wrap--narrow{max-width:720px}
.wrap--form{max-width:440px}

/* ── типографика: крупный заголовок, тесная выключка, отрицательный трекинг */
h1{margin:0 0 14px;color:var(--ink);font-size:clamp(28px,3.4vw,40px);line-height:1.1;
letter-spacing:-.02em;font-weight:700}
.h-hero{font-size:clamp(32px,4.2vw,46px);line-height:1.08;max-width:14ch}
.h-hero{max-width:none}
.h-hero em{font-style:normal;color:var(--brand)}
h2{margin:0 0 12px;color:var(--ink);font-size:clamp(22px,2.4vw,28px);line-height:1.2;
letter-spacing:-.015em;font-weight:700}
h3{margin:0 0 8px;color:var(--ink);font-size:19px;font-weight:700}
.center{text-align:center}
.lead,.lede{margin:0 0 22px;color:var(--muted);font-size:17px}
.small{font-size:14px}
.muted{color:var(--muted)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 20px;padding:7px 16px;
border:1px solid var(--line);border-radius:100px;font-size:14px;color:var(--ink);background:#fff}
.eyebrow span{color:var(--muted)}

/* ── элементы управления: прямоугольник с малым радиусом, не пилюля */
.btn{display:inline-block;min-height:48px;padding:0 24px;border:1px solid var(--brand);
border-radius:var(--r);background:var(--brand);color:#fff;
font:600 16px/46px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
cursor:pointer;text-decoration:none;text-align:center;margin-top:14px}
.btn:hover{background:var(--brand-dk);border-color:var(--brand-dk)}
.btn--ghost{background:#fff;color:var(--brand);border-color:#cfd9e6}
.btn--ghost:hover{background:var(--brand-soft);border-color:var(--brand)}
.btn--sm{min-height:38px;padding:0 16px;font-size:14px;line-height:36px;margin-top:0}
.btn--link{min-height:0;padding:0;margin:0;border:0;background:none;color:var(--brand);
font:inherit;font-size:14px;line-height:inherit;cursor:pointer;text-decoration:none}
.row{display:flex;flex-wrap:wrap;gap:12px}

/* ── карточка: тонкая рамка, крупный радиус, БЕЗ тени */
.card{background:#fff;border:1px solid var(--line);border-radius:var(--r-card);
padding:26px;margin-bottom:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.cards .card{margin:0}

/* ── список с отметками */
.checks{list-style:none;margin:0 0 26px;padding:0}
.checks li{position:relative;padding:0 0 12px 32px;color:var(--ink)}
.checks li::before{content:"";position:absolute;left:0;top:5px;width:20px;height:20px;
border-radius:50%;background:var(--ok);
-webkit-mask:no-repeat center/11px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23fff' d='M4.6 9.4 1.2 6l1.1-1.1 2.3 2.3 5-5L10.7 3z'/%3E%3C/svg%3E"),
             no-repeat center/cover linear-gradient(#fff,#fff);
mask:no-repeat center/11px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23fff' d='M4.6 9.4 1.2 6l1.1-1.1 2.3 2.3 5-5L10.7 3z'/%3E%3C/svg%3E"),
      no-repeat center/cover linear-gradient(#fff,#fff);
-webkit-mask-composite:xor;mask-composite:exclude}

/* ── две колонки: текст и наглядное */
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
@media(max-width:880px){.split{grid-template-columns:1fr;gap:32px}}
.media{border-radius:var(--r-media);border:1px solid var(--line);background:var(--band);
padding:40px 32px;min-height:420px;display:flex;align-items:center;justify-content:center}
/* Макет гостевого экрана внутри наглядного. Собственные классы, а не .btn: у кнопки
   фиксированная высота строки, и подпись в две строки из неё вываливается. */
.mock{width:100%;max-width:320px}
.mock__door{display:block;margin:0 0 10px;padding:13px 16px;border-radius:var(--r);
border:1px solid #cfd9e6;background:#fff;color:var(--brand);font-weight:600;font-size:15px;
line-height:1.35;text-align:center}
.mock__door--primary{background:var(--brand);border-color:var(--brand);color:#fff}

/* ── полоса чисел: число, подпись, волосяная линия, пояснение */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:36px}
.stat .n{color:#8b95a1;font-size:clamp(38px,4.4vw,54px);line-height:1;letter-spacing:-.02em}
.stat .t{margin:6px 0 14px;color:var(--ink);font-size:20px;font-weight:700}
.stat hr{border:0;border-top:1px solid var(--line);margin:0 0 12px}
.stat p{margin:0;font-size:14px;color:var(--muted)}

/* ── формы */
.lbl{display:block;font-size:14px;font-weight:600;color:var(--ink);margin:14px 0 6px}
.inp{width:100%;padding:12px 14px;border:1px solid #cfd9e6;border-radius:var(--r);font:inherit;
background:#fff;color:var(--ink)}
.inp:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
.err{margin:0 0 16px;padding:12px 16px;border-radius:var(--r);background:var(--err-soft);
color:var(--err);font-size:15px}
.warn{margin:0 0 20px;padding:14px 18px;border-radius:var(--r);background:var(--warn-soft);
color:var(--warn);font-size:15px}
.ok{margin:0 0 16px;padding:12px 16px;border-radius:var(--r);background:#e8f6ee;color:#15683f;font-size:15px}

/* ── шапка кабинета и служебные */
.nav{display:flex;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line);
font-size:15px}
.nav .wrap{display:flex;gap:16px;align-items:center;width:100%}
.nav a{text-decoration:none}
.nav .sp,.sp{flex:1}
.brandmark{color:var(--ink);font-weight:700;font-size:18px;letter-spacing:-.01em;text-decoration:none}
.place{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:baseline}
.place b{color:var(--ink);font-size:19px}
.chip{font-size:14px;color:var(--muted)}
.chip b{color:var(--ink);font-size:14px}
.fb{border-top:1px solid var(--line);padding:16px 0}
.fb:first-of-type{border-top:0}
.fb .meta{font-size:14px;color:var(--muted);margin-top:6px}
.fb .body{white-space:pre-wrap;color:var(--ink)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;
background:var(--band);padding:3px 8px;border-radius:6px;color:var(--ink)}
a.qr{font-size:14px}
.sep{border:0;border-top:1px solid var(--line);margin:24px 0}
.cmd{display:block;padding:14px 16px;border-radius:var(--r);background:var(--band);
border:1px solid var(--line);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
word-break:break-all;user-select:all;-webkit-user-select:all;color:var(--ink)}
.qrbox{width:190px;margin:0 0 16px;padding:12px;background:#fff;border:1px solid var(--line);
border-radius:var(--r-card)}
.qrbox svg{display:block;width:100%;height:auto}

/* ── печатные макеты */
.mk{margin:0 0 20px;background:#fff;border:1px solid var(--line);border-radius:var(--r-card);overflow:hidden}
.mk figcaption{display:flex;gap:10px;align-items:baseline;padding:12px 18px;
border-bottom:1px dashed var(--line);font-size:14px}
.mk figcaption b{color:var(--ink)}.mk figcaption span{color:var(--muted);font-size:13px}
.mk__body{display:flex;gap:20px;align-items:center;padding:20px}
.mk__qr{flex:none;width:128px}.mk__qr svg{display:block;width:100%;height:auto}
.mk__name{margin:0;font-weight:700;color:var(--ink)}
.mk__cta{margin:2px 0 6px}
.mk__url{margin:0;font-family:ui-monospace,monospace;font-size:13px;color:var(--muted)}
@media print{body{background:#fff}.nav,.lead,.lede,.warn,.btn,h1{display:none}
.band{padding:0}.mk{page-break-inside:avoid;border:1px dashed #999}}

/* ── подвал */
.foot{padding:32px 20px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
`;

/** Оболочка страницы. ОДНА на все поверхности кабинета: три страницы носили собственные
 *  <style>, и системы в них уже разошлись — у одной пилюля, у другой прямоугольник, рамки
 *  разного цвета. Две копии одной системы расходятся молча, поэтому копия ровно одна. */
function page(title: string, body: string, wide = false): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ReviewQR</title><style>${CSS}</style></head>
<body>${wide ? body : `<div class="band band--tight"><div class="wrap wrap--narrow">${body}</div></div>`}</body></html>`;
}

/**
 * Публичная страница продукта. Раскладка снята со снимков Birdeye
 * (`docs/discovery/screenshots/birdeye-home.png`, `birdeye-reviews-hero.png`), строки
 * FR-LOOK-013…019 профиля источника: полосы во всю ширину, две колонки в первом экране,
 * список с отметками, пара «заливка + рамка», полоса чисел с волосяной линией.
 *
 * ЧИСЛА В ПОЛОСЕ — ИЗМЕРЕННЫЕ, А НЕ МАРКЕТИНГОВЫЕ, и это решение, а не осторожность.
 * У образца на этом месте «128% больше отзывов» и «4.8 рейтинг» — чужие результаты, которых
 * у нас нет. Скопировать форму вместе с числами значило бы выдать чужое измерение за своё;
 * PRD §2.4 требует от метрики число И источник. Поэтому в полосе стоит то, что мы можем
 * предъявить: замер доставки со стенда, свойство продукта и цена из DEC-PAY-1.
 */
/** Оболочка страниц кабинета: шапка во всю ширину, содержимое в узкой колонке.
 *  `back` — обратная ссылка; без неё шапка несёт выход. */
function appPage(title: string, body: string, back?: { href: string; text: string }): string {
  return page(title, `
<header class="nav"><div class="wrap">
  <a class="brandmark" href="/dashboard">ReviewQR</a>
  ${back ? `<a href="${esc(back.href)}">${esc(back.text)}</a>` : ''}
  <span class="sp"></span>
  <form method="post" action="/logout" style="margin:0"><button class="btn btn--ghost btn--sm" type="submit">Выйти</button></form>
</div></header>
<div class="band band--tight"><div class="wrap wrap--narrow">${body}</div></div>`, true);
}

export function landingPage(priceRub: number): string {
  return page('Отзывы на картах по QR', `
<header class="nav"><div class="wrap">
  <a class="brandmark" href="/">ReviewQR</a><span class="sp"></span>
  <a href="/login">Войти</a>
  <a class="btn btn--sm" href="/register">Завести кабинет</a>
</div></header>

<section class="band">
 <div class="wrap split">
  <div>
    <p class="eyebrow">ReviewQR <span>· отзывы и репутация</span></p>
    <h1 class="h-hero">Довольный гость оставляет отзыв <em>на картах</em>, недовольный — пишет вам</h1>
    <ul class="checks">
      <li>QR на столе, в чеке и на упаковке — отзыв за минуту, без приложений</li>
      <li>Две двери на одном экране: площадка и приватное обращение</li>
      <li>Обращение приходит в Telegram сразу — отвечаете гостю лично</li>
      <li>Ссылки на площадки меняются в кабинете, носители не перепечатываются</li>
    </ul>
    <div class="row">
      <a class="btn" href="/register">Завести кабинет</a>
      <a class="btn btn--ghost" href="/login">Войти</a>
    </div>
  </div>
  <div class="media"><div class="mock">
    <div class="card" style="margin:0;padding:24px;text-align:center">
      <p class="small muted" style="margin:0 0 6px">Кофейня «Артель»</p>
      <p style="margin:0 0 20px;color:var(--ink);font-size:20px;font-weight:700;line-height:1.25">Расскажите,<br>как всё прошло</p>
      <span class="mock__door mock__door--primary">Яндекс.Карты</span>
      <span class="mock__door">2ГИС</span>
      <span class="mock__door" style="margin:0">Написать нам лично</span>
    </div>
    <p class="small muted center" style="margin:16px 0 0">так гость видит вашу страницу</p>
  </div></div>
 </div>
</section>

<section class="band band--tint">
 <div class="wrap">
  <h2 class="center">Что это даёт</h2>
  <p class="lede center">Числа измеренные, а не обещанные — каждое можно проверить.</p>
  <div class="stats">
    <div class="stat"><div class="n">5 сек</div><div class="t">До сообщения в Telegram</div><hr>
      <p>От нажатия «отправить» на странице гостя до сообщения владельцу. Замер на стенде 02.09.2026.</p></div>
    <div class="stat"><div class="n">1 QR</div><div class="t">На все площадки сразу</div><hr>
      <p>Код ведёт на вашу страницу, а не на площадку. Сменили ссылку — носители остались прежними.</p></div>
    <div class="stat"><div class="n">${priceRub} ₽</div><div class="t">План «Точка», 30 дней</div><hr>
      <p>Бесплатный план работает полностью; платный снимает строку «Сделано на ReviewQR».</p></div>
  </div>
 </div>
</section>

<section class="band">
 <div class="wrap">
  <h2 class="center">Как это устроено</h2>
  <p class="lede center">Три шага, ни одного приложения — ни вам, ни гостю.</p>
  <div class="cards">
    <div class="card"><h3>1. Заводите точку</h3>
      <p class="small">Название — и адрес страницы соберётся сам. Ссылки на Яндекс.Карты и 2ГИС
      вставляются в кабинете и меняются когда угодно.</p></div>
    <div class="card"><h3>2. Ставите QR</h3>
      <p class="small">Готовые макеты: подвал счёта, оборот визитки, наклейка, тейбл-тент.
      Печатаются из браузера, без дизайнера.</p></div>
    <div class="card"><h3>3. Читаете обращения</h3>
      <p class="small">Публичные отзывы уходят на площадки, приватные — в кабинет и в Telegram.
      Ответить гостю можно в тот же час.</p></div>
  </div>
 </div>
</section>

<section class="band band--tint">
 <div class="wrap wrap--narrow center">
  <h2>Честная граница</h2>
  <p class="lede">Продукт не подсказывает гостю содержание отзыва, не обещает за него
  вознаграждение и не сортирует гостей по тональности до выбора двери. Это не осторожность,
  а условие, при котором площадки не считают отзывы накруткой.</p>
  <a class="btn" href="/register">Завести кабинет</a>
 </div>
</section>

<footer class="foot"><div class="wrap">
  ReviewQR · отзывы и репутация для локального бизнеса ·
  <a href="/login">вход</a> · <a href="/register">регистрация</a>
</div></footer>`, true);
}

export function authPage(mode: 'login' | 'register', error?: string): string {
  const login = mode === 'login';
  return page(login ? 'Вход' : 'Регистрация', `
<p style="margin:0 0 20px"><a class="brandmark" href="/">ReviewQR</a></p>
<main class="card" style="max-width:440px">
<h1>${login ? 'Вход' : 'Регистрация'}</h1>
<p class="lead">${login ? 'Кабинет владельца заведения.' : 'Пара минут — и у вашей точки будет QR для отзывов.'}</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/${mode}">
  <label class="lbl" for="email">Почта</label>
  <input class="inp" id="email" name="email" type="email" required autocomplete="email">
  <label class="lbl" for="password">Пароль</label>
  <input class="inp" id="password" name="password" type="password" required minlength="8"
    autocomplete="${login ? 'current-password' : 'new-password'}">
  ${login ? '' : `<label class="lbl" for="account">Название бизнеса</label>
  <input class="inp" id="account" name="account" maxlength="200" placeholder="Кофейня «Артель»">`}
  <button class="btn" type="submit">${login ? 'Войти' : 'Создать кабинет'}</button>
</form>
<p style="margin:16px 0 0;font-size:14px">${login
  ? 'Нет кабинета? <a href="/register">Зарегистрироваться</a>'
  : 'Уже есть кабинет? <a href="/login">Войти</a>'}</p>
</main>`);
}

export interface PlaceView {
  id: string; slug: string; name: string;
  links: { platform: string; url: string }[];
  feedback_count: number; scan_count: number;
}

export interface BillingInfo { plan: string | null; periodEnd: string | null; priceRub: number }

function billingBlock(b: BillingInfo | undefined): string {
  if (!b) return '';
  if (b.plan) return `<section class="card"><h2>План «Точка»</h2>
  <p style="font-size:14px">Оплачен до <b>${esc(b.periodEnd ?? '')}</b>. Строка «Сделано на ReviewQR» на гостевых страницах снята.</p>
  <form method="post" action="/billing/checkout"><button class="btn btn--ghost" type="submit">Продлить ещё 30 дней — ${b.priceRub} ₽</button></form>
</section>`;
  return `<section class="card"><h2>План: Free</h2>
  <p style="font-size:14px">На гостевых страницах гостям видна строка «Сделано на ReviewQR».
  План «Точка» её снимает — для всех точек аккаунта.</p>
  <form method="post" action="/billing/checkout"><button class="btn" type="submit">Подключить «Точку» — ${b.priceRub} ₽ / 30 дней</button></form>
</section>`;
}

export function dashboardPage(places: PlaceView[], baseUrl: string, error?: string, billing?: BillingInfo): string {
  const list = places.map((p) => `
<section class="card">
  <div class="place">
    <b>${esc(p.name)}</b>
    <span class="mono">/r/${esc(p.slug)}</span>
    <span class="chip">сканы: <b>${p.scan_count}</b></span>
    <span class="chip">обращения: <b>${p.feedback_count}</b></span>
    <span class="sp" style="flex:1"></span>
    <a class="qr" href="/places/${esc(p.id)}/qr">QR и макеты</a>
    <form method="post" action="/places/${esc(p.id)}/bind" style="display:inline;margin:0"><button class="qr" style="background:none;border:0;color:var(--brand);cursor:pointer;font:inherit;padding:0">уведомления</button></form>
    <a class="qr" href="/places/${esc(p.id)}">обращения →</a>
  </div>
  <form method="post" action="/places/${esc(p.id)}/links" style="margin-top:10px">
    <label class="lbl">Ссылка на Яндекс.Карты
      <input class="inp" name="yandex_maps" placeholder="https://yandex.ru/maps/org/…"
        value="${esc(p.links.find((l) => l.platform === 'yandex_maps')?.url ?? '')}"></label>
    <label class="lbl">Ссылка на 2ГИС
      <input class="inp" name="twogis" placeholder="https://2gis.ru/firm/…"
        value="${esc(p.links.find((l) => l.platform === 'twogis')?.url ?? '')}"></label>
    <button class="btn btn--ghost" type="submit">Сохранить ссылки</button>
  </form>
  <p style="margin:12px 0 0;font-size:14px">Страница гостя:
    <a href="${esc(baseUrl)}/r/${esc(p.slug)}">${esc(baseUrl)}/r/${esc(p.slug)}</a></p>
</section>`).join('');

  return appPage('Кабинет', `
<h1>Ваши точки</h1>
<p class="lede">QR ведёт на страницу точки, а не на площадку: ссылки меняются здесь,
носители не перепечатываются.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
${list || '<p class="lead">Точек пока нет — создайте первую.</p>'}
${billingBlock(billing)}
<section class="card">
<h2>Новая точка</h2>
<form method="post" action="/places">
  <label class="lbl" for="name">Название</label>
  <input class="inp" id="name" name="name" required maxlength="200" placeholder="Кофейня «Артель»">
  <p style="margin:8px 0 0;font-size:13px;color:var(--muted)">Адрес страницы для QR соберётся
  из названия сам — например, «Кофейня «Артель»» получит
  <span class="mono">/r/kofeynya-artel</span>. Он будет виден сразу после создания.</p>
  <button class="btn" type="submit">Создать</button>
</form>
</section>`);
}

export interface FeedbackView { body: string; rating: number | null; contact: string | null; created_at: string; }

export function feedbackPage(placeName: string, items: FeedbackView[]): string {
  const rows = items.map((f) => `
<div class="fb">
  <div class="body">${esc(f.body)}</div>
  <div class="meta">${f.rating ? `оценка ${f.rating}/5 · ` : ''}${f.contact ? `${esc(f.contact)} · ` : ''}${esc(new Date(f.created_at).toLocaleString('ru-RU'))}</div>
</div>`).join('');
  return appPage(placeName, `
<main class="card">
<h1>${esc(placeName)}</h1>
<p class="lead">Приватные обращения гостей. Видите их только вы.</p>
${rows || '<p class="lead">Пока пусто. Поставьте QR — обращения появятся здесь.</p>'}
</main>`, { href: '/dashboard', text: '← кабинет' });
}

/**
 * Страница QR и печатных макетов.
 *
 * ЧТО ЗДЕСЬ НАМЕРЕННО ОТСУТСТВУЕТ (NFR-LEGAL-001 и разбор модерации площадок):
 *   · подсказки содержания отзыва («напишите про кухню») — единственная действующая
 *     норма Яндекса, задевающая продукт: подсказывать содержание нельзя;
 *   · упоминание вознаграждения («скидка за отзыв») — вторая норма, и она же у 2ГИС;
 *   · блок «свободный Wi-Fi + QR отзыва» — отзывы пачкой с одного адреса читаются
 *     антифродом как накрутка; это сочетание кажется владельцу естественным, поэтому
 *     предупреждение стоит прямо в макетах, а не в справке.
 * Стражи в тестах проверяют отсутствие этих элементов ПО ТЕКСТУ страницы.
 */
export function qrPage(placeName: string, slug: string, svg: string, guestHref: string): string {
  const cut = (title: string, note: string, cls = '') => `
<figure class="mk ${cls}">
  <figcaption><b>${esc(title)}</b><span>${esc(note)}</span></figcaption>
  <div class="mk__body">
    <div class="mk__qr">${svg}</div>
    <div class="mk__txt">
      <p class="mk__name">${esc(placeName)}</p>
      <p class="mk__cta">Расскажите, как всё прошло</p>
      <p class="mk__url">${esc(guestHref.replace(/^https?:\/\//, ''))}</p>
    </div>
  </div>
</figure>`;

  return appPage(`QR — ${placeName}`, `
<h1>QR для «${esc(placeName)}»</h1>
<p class="lead">Код ведёт на ваш адрес ${esc(guestHref)} — ссылки на площадки можно менять,
носители перепечатывать не придётся.</p>

${cut('Подвал счёта', 'уносимый носитель: гость сканирует дома, со своей сети')}
${cut('Оборот визитки', 'уносимый: кладите в пакет с заказом')}
${cut('Наклейка на упаковку', 'уносимый: доставка и самовывоз')}

<p class="warn"><b>Тейбл-тент — с оговоркой.</b> На столе он безопасен, пока гость сканирует
<b>своим телефоном на своей сети</b>. Не размещайте рядом пароль от гостевого Wi‑Fi и не
предлагайте общий планшет: отзывы, ушедшие пачкой с одного адреса, площадки считают накруткой.</p>
${cut('Тейбл-тент', 'настольный: только для гостей со своим интернетом', 'mk--tent')}

<a class="btn" href="javascript:print()">Печать</a>`, { href: '/dashboard', text: '← кабинет' });
}

export function bindStartPage(placeName: string, placeId: string, bound: boolean): string {
  // Страница ПОД GET, и это не удобство, а требование безопасности метода.
  //
  // Выдача токена — действие: она перезаписывает хеш в БД и убивает прежний диплинк.
  // Значит она обязана жить под POST, а GET обязан быть безвредным: браузеры и мессенджеры
  // ходят по ссылкам сами (предзагрузка, разворачивание превью, «открыть в фоне»), и токен
  // на GET перевыпускался бы от одного лишь просмотра.
  //
  // Но раньше GET здесь не отвечал НИЧЕМ, кроме «не найдено»: владелец, пришедший по прямой
  // ссылке или по закладке, упирался в тупик на работающем стенде. Тот же класс, что 404 на
  // голом /dashboard в проекте 01 — маршрут, который человек набирает руками, отвечал так,
  // будто его нет.
  return appPage(`Уведомления — ${placeName}`, `

<h1>Уведомления для «${esc(placeName)}»</h1>
${bound
  ? `<p class="ok">Бот уже подключён — обращения гостей приходят в Telegram.</p>
     <p class="muted">Кнопка ниже выдаст новую ссылку, если нужно перевести уведомления на
     другой телефон или аккаунт. Пока по новой ссылке никто не нажмёт Start, сообщения
     продолжат приходить туда же, куда и сейчас.</p>`
  : `<p>Обращения гостей могут приходить вам в Telegram сразу, как их оставили. Нажмите
     кнопку — выдам одноразовую ссылку на бота.</p>`}
<form method="post" action="/places/${esc(placeId)}/bind" style="margin:0">
  <button class="btn" type="submit">${bound ? 'Выдать новую ссылку' : 'Получить ссылку на бота'}</button>
</form>
`, { href: '/dashboard', text: '← кабинет' });
}

/** Диплинк на бота. ОДНО место постройки: страница и QR обязаны вести по одному адресу,
 *  а две независимые сборки одной строки однажды разойдутся молча. */
export function botDeepLink(botUsername: string, token: string): string {
  return botUsername ? `https://t.me/${botUsername}?start=${token}` : '';
}

export function bindPage(placeName: string, botUsername: string, token: string, qr = ''): string {
  const link = botDeepLink(botUsername, token);
  // Три ДРУГИХ пути к одному и тому же действию — потому что t.me отказывает не у нас.
  //
  // Страница t.me принадлежит Telegram и делает ровно одно: передаёт управление приложению
  // через схему tg://. Если приложение на этой машине со схемой не связано (нет десктопного
  // клиента, браузер запретил передачу, открыто в режиме без расширений) — страница пуста, и
  // сделать с ней нельзя НИЧЕГО: это не наш HTML. Поэтому не «чиним t.me», а обходим его:
  //   · QR    — читает телефон, где Telegram точно установлен; браузер вообще не участвует;
  //   · tg:// — сразу приложению, минуя страницу-посредника;
  //   · web   — Telegram Web в этой же вкладке, если владелец в нём уже вошёл.
  // Плюс команда текстом: она работает всегда и не зависит ни от чего, кроме самого бота.
  const tgScheme = botUsername ? `tg://resolve?domain=${botUsername}&start=${token}` : '';
  const webLink = botUsername
    ? `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(tgScheme)}`
    : '';
  return appPage(`Уведомления — ${placeName}`, `

<h1>Уведомления для «${esc(placeName)}»</h1>
${link
  ? `<p>Нажмите кнопку — откроется Telegram. В боте нажмите <b>Start</b>, и обращения гостей
     начнут приходить вам сообщением в ту же минуту.</p>
     <p><a class="btn" href="${esc(link)}">Подключить Telegram</a></p>
     <hr class="sep">
     <p><b>Кнопка не сработала?</b> Страница <code>t.me</code> принадлежит Telegram и только
     передаёт управление приложению — если на этом устройстве оно не подхватывается, она
     остаётся пустой, и повторные нажатия не помогут. Обойдите её любым из трёх способов.</p>
     ${qr ? `<p class="muted">1. Наведите камеру телефона — Telegram откроется сразу
     на нужном боте и с кодом:</p><div class="qr">${qr}</div>` : ''}
     <p class="muted">${qr ? '2.' : '1.'} Если Telegram установлен на этом компьютере —
     <a href="${esc(tgScheme)}">открыть в приложении напрямую</a>, минуя страницу t.me.</p>
     <p class="muted">${qr ? '3.' : '2.'} Если пользуетесь Telegram в браузере —
     <a href="${esc(webLink)}" target="_blank" rel="noopener">открыть в Telegram Web</a>.</p>
     <hr class="sep">
     <p><b>Ничего из этого не подошло — способ, работающий всегда.</b> У бота, которого вы
     уже запускали раньше, Telegram кнопку Start больше не показывает, и код передать нечем.
     Тогда откройте бота
     <a href="${esc(botUsername ? 'https://t.me/' + botUsername : '#')}">@${esc(botUsername)}</a>
     любым способом и отправьте ему обычным сообщением вот это:</p>
     <p><code class="cmd">/start ${esc(token)}</code></p>
     <p class="muted">Это ровно то же самое, что делает кнопка: код в ней и код в этой строке —
     один и тот же. Отправьте одной строкой, целиком.</p>
     <p class="muted">Код одноразовый. Понадобится другой — выдайте новый с этой же страницы:
     прежний перестанет действовать, а уведомления продолжат приходить в текущий чат, пока по
     новому коду никто не нажмёт Start.</p>`
  : `<p class="err">Бот уведомлений ещё не настроен на этом стенде (нет TELEGRAM_BOT_USERNAME).
     Обращения гостей видны в кабинете — push подключится, как только бот будет заведён.</p>`}
`, { href: '/dashboard', text: '← кабинет' });
}
