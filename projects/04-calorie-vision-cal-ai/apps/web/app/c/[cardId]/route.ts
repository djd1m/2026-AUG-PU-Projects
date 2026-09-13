// `GET /c/{card_id}` — маршрут 6 канона, `RenderPublicCardPage`
// (`docs/features/share-card-and-growth-events/02_pseudocode.md`). Публичная страница, БЕЗ cookie.
//
// РЕАЛИЗОВАН как Route Handler (`route.ts`), а не как `page.tsx` (архитектурный документ фичи,
// `03_architecture.md`, называет `page.tsx`) — ОТКЛОНЕНИЕ, названное явно. Причина:
// AC-share-card-and-growth-events-8 требует `Cache-Control: no-store` НА ОБЕИХ ветках (200 и 404),
// установленный ОДНИМ местом кода (шаг 6 псевдокода). У `page.tsx` + `notFound()` в App Router
// нет единого места для установки произвольного HTTP-заголовка на ветке `notFound` (она рендерит
// `not-found.tsx` через отдельный механизм, вне возврата самой функции страницы) — риск ровно
// того стража, что назван в `04_refinement.md` («продублировать установку в двух местах и убрать
// из одной»). Route Handler возвращает `NextResponse` из ОДНОЙ функции для ОБЕИХ веток — заголовок
// ставится ровно один раз, синтаксически невозможно поставить его только на одной из двух.
//
// Изображение НЕ встроено в этот HTML как presigned-URL: `<img src="/c/{id}/image">` указывает на
// СВОЙ ЖЕ origin (второй Route Handler ниже, который стримит байты сам) — того же требует CSP
// (`middleware.ts`, `img-src 'self'`) и того же требует `docker-ports.md` (MinIO не опубликован
// НИКУДА за пределы сети compose, presigned-URL на `minio:9000` браузеру попросту недостижим).

import { loadWebConfig } from '../../../env';

export const dynamic = 'force-dynamic';

// НЕ импортируется из `@n4/shared` (`sanitizeForCardText`/`escapeHtml` уже там) — `apps/web`
// сегодня НЕ объявляет `@n4/shared` зависимостью workspace (`apps/web/package.json`), и добавление
// новой межпакетной зависимости требует правки `package-lock.json` координатором при слиянии, а не
// молчаливо этой фичей. Правило экранирования — те же пять сущностей HTML, что уже реализованы в
// `packages/shared/src/text/sanitize-for-card-text.ts` — дублируется здесь НАМЕРЕННО и узко: это
// единственное место в `apps/web`, вставляющее недоверенный текст (название блюда, модель/сам
// пользователь) в разметку без фреймворка (Route Handler строит HTML-строку вручную, JSX-движок
// Next её не экранирует за нас).
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface CardPayload {
  readonly data: {
    readonly dish_name: string;
    readonly source_label: string;
    readonly badge_rendered: boolean;
  };
}

function htmlResponse(status: number, body: string): Response {
  // ОДНО место, ОДИН заголовок — для обеих веток (200/404), см. комментарий файла.
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Route Handler отдаёт СЫРУЮ HTML-строку, а не проходит через `app/globals.css` (тот
// компилируется бандлером Next в хэшированный файл, недоступный по стабильному пути) —
// поэтому у публичной карточки СВОЙ инлайновый `<style>`, тот же шрифт и та же палитра,
// что и у остального продукта (`../../globals.css`, тема — светлая бумага + один тёмный
// блок). `style-src 'self' 'unsafe-inline'` разрешает инлайновый тег (`middleware.ts`).
const CARD_STYLE = `
@font-face{font-family:'Unbounded';src:url('/fonts/Unbounded-wght.ttf') format('truetype');font-weight:200 900;font-display:swap}
@font-face{font-family:'Onest';src:url('/fonts/Onest-wght.ttf') format('truetype');font-weight:100 900;font-display:swap}
*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100%;background:#1b1523;color:#fbf8f2;font:400 15px/1.5 'Onest',-apple-system,'Segoe UI',sans-serif}
.card{max-width:420px;margin:0 auto;padding:32px 20px 40px;display:grid;gap:16px}
.card__photo{border-radius:24px;overflow:hidden;background:#0a0710;aspect-ratio:9/16;display:grid}
.card__photo img{width:100%;height:100%;object-fit:cover;display:block}
.card__name{font-family:'Unbounded',sans-serif;font-weight:700;font-size:22px;line-height:1.2;margin:0}
.card__source{font-size:12px;letter-spacing:.04em;color:rgba(251,248,242,.66);margin:0}
.card__brand{font-family:'Unbounded',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ffc531;margin:8px 0 0}
`;

const NOT_FOUND_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Карточка не найдена</title><style>${CARD_STYLE}</style></head><body><main class="card"><p class="card__name">Карточка не найдена</p><p class="card__source">Возможно, автор закрыл доступ или ссылка устарела.</p></main></body></html>`;

export async function GET(_request: Request, context: { params: Promise<{ cardId: string }> }): Promise<Response> {
  const { cardId } = await context.params;
  // `honest-configuration.md` CFG-S1 — отсутствующий обязательный адрес отказывает
  // (`loadWebConfig` бросает), а не тихо падает на localhost.
  const { apiInternalUrl } = loadWebConfig();

  const upstream = await fetch(`${apiInternalUrl}/internal/share-cards/${encodeURIComponent(cardId)}`, { cache: 'no-store' });
  if (!upstream.ok) return htmlResponse(404, NOT_FOUND_HTML);

  const payload = (await upstream.json()) as CardPayload;
  const dishName = escapeHtml(payload.data.dish_name);
  const sourceLabel = escapeHtml(payload.data.source_label);
  const imagePath = `/c/${encodeURIComponent(cardId)}/image`;

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${dishName} — Тарелка</title>
  <meta property="og:title" content="${dishName}">
  <meta property="og:image" content="${imagePath}">
  <meta property="og:type" content="article">
  <style>${CARD_STYLE}</style>
</head>
<body>
  <main class="card">
    <div class="card__photo">
      <img src="${imagePath}" alt="${dishName}" width="1080" height="1920">
    </div>
    <p class="card__name">${dishName}</p>
    <p class="card__source">${sourceLabel}</p>
    <p class="card__brand">Тарелка</p>
  </main>
</body>
</html>`;

  return htmlResponse(200, html);
}
