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

const NOT_FOUND_HTML = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Карточка не найдена</title></head><body><p>Карточка не найдена.</p></body></html>';

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
  <title>${dishName} — Тарелка</title>
  <meta property="og:title" content="${dishName}">
  <meta property="og:image" content="${imagePath}">
  <meta property="og:type" content="article">
</head>
<body>
  <img src="${imagePath}" alt="${dishName}" width="1080" height="1920">
  <p>${dishName}</p>
  <p>${sourceLabel}</p>
</body>
</html>`;

  return htmlResponse(200, html);
}
