// Страницы кабинета. Тот же приём, что у гостя: SSR-строки, ноль клиентского JS в MVP,
// экранирование в одном месте, токены дизайн-системы оригинала.

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const CSS = `
:root{--ink:#00132e;--text:#364459;--brand:#025bde;--brand-soft:#e1edff;--tint:#f5f9ff;
--line:#c1c1c1;--muted:#6b7a90;--ok:#0f7a4d;--err:#a3231e;--err-soft:#ffe9e8;
--shadow:1px 1px 19px 0 #1874fd26;--r-card:16px;--r-pill:100px}
*{box-sizing:border-box}
body{margin:0;padding:32px 16px 48px;background:var(--tint);color:var(--text);
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:720px;margin:0 auto}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--r-card);
box-shadow:var(--shadow);padding:24px;margin-bottom:16px}
h1{margin:0 0 4px;color:var(--ink);font-size:24px}
h2{margin:0 0 12px;color:var(--ink);font-size:18px}
.lead{margin:0 0 20px;color:var(--muted);font-size:15px}
.lbl{display:block;font-size:14px;font-weight:600;color:var(--ink);margin:12px 0 4px}
.inp{width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:12px;font:inherit}
.inp:focus{outline:2px solid var(--brand);outline-offset:1px}
.btn{min-height:46px;padding:0 22px;border:0;border-radius:var(--r-pill);background:var(--brand);
color:#fff;font:600 15px/1 inherit;cursor:pointer;margin-top:14px}
.btn--ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.err{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:var(--err-soft);color:var(--err);font-size:14px}
.nav{display:flex;gap:14px;align-items:center;margin-bottom:20px;font-size:14px}
.nav a{color:var(--brand);text-decoration:none}
.nav .sp{flex:1}
.place{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline}
.place b{color:var(--ink);font-size:17px}
.chip{font-size:13px;color:var(--muted)}
.chip b{color:var(--ink);font-size:13px}
.fb{border-top:1px solid var(--line);padding:12px 0}
.fb:first-of-type{border-top:0}
.fb .meta{font-size:13px;color:var(--muted);margin-top:4px}
.fb .body{white-space:pre-wrap}
.mono{font-family:ui-monospace,monospace;font-size:13px;background:var(--tint);padding:2px 6px;border-radius:6px}
a.qr{font-size:14px}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ReviewQR</title><style>${CSS}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

export function authPage(mode: 'login' | 'register', error?: string): string {
  const login = mode === 'login';
  return page(login ? 'Вход' : 'Регистрация', `
<main class="card" style="max-width:420px;margin:0 auto">
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

export function dashboardPage(places: PlaceView[], baseUrl: string, error?: string): string {
  const list = places.map((p) => `
<section class="card">
  <div class="place">
    <b>${esc(p.name)}</b>
    <span class="mono">/r/${esc(p.slug)}</span>
    <span class="chip">сканы: <b>${p.scan_count}</b></span>
    <span class="chip">обращения: <b>${p.feedback_count}</b></span>
    <span class="sp" style="flex:1"></span>
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

  return page('Кабинет', `
<nav class="nav"><b style="color:var(--ink)">ReviewQR</b><span class="sp"></span>
<form method="post" action="/logout" style="margin:0"><button class="btn btn--ghost" style="min-height:34px;margin:0">Выйти</button></form></nav>
${error ? `<p class="err">${esc(error)}</p>` : ''}
${list || '<p class="lead">Точек пока нет — создайте первую.</p>'}
<section class="card">
<h2>Новая точка</h2>
<form method="post" action="/places">
  <label class="lbl" for="name">Название</label>
  <input class="inp" id="name" name="name" required maxlength="200" placeholder="Кофейня «Артель»">
  <label class="lbl" for="slug">Адрес страницы (латиницей)</label>
  <input class="inp" id="slug" name="slug" required pattern="[a-z0-9-]{3,40}" placeholder="artel">
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
  return page(placeName, `
<nav class="nav"><a href="/dashboard">← кабинет</a></nav>
<main class="card">
<h1>${esc(placeName)}</h1>
<p class="lead">Приватные обращения гостей. Видите их только вы.</p>
${rows || '<p class="lead">Пока пусто. Поставьте QR — обращения появятся здесь.</p>'}
</main>`);
}
