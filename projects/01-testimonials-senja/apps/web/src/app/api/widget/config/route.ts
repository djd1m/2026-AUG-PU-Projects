// GET /api/widget/config?slug=...&domain=... — единственный сетевой запрос виджета
// (Architecture §4.2; канонический путь — Architecture §10, НЕ /api/widget-config).

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { buildWidgetConfig, safeDefault } from '@/lib/widget-config';
import { emitEvents, normalizeDomain, recordInstallAndInviteIfNeeded } from '@/lib/widget-install';

export const dynamic = 'force-dynamic';

// Виджет встраивается на ЧУЖИЕ домены — без CORS браузер не отдаст ему ответ.
// Caddy ставит тот же заголовок в проде (Caddyfile), здесь он нужен для разработки
// и для случая, когда web стоит без прокси.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Кэшировать нельзя: badge_required меняется вместе с тарифом, и закэшированный
  // ответ у free-проекта означал бы badge, исчезнувший до конца TTL.
  'Cache-Control': 'no-store',
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';

  // Параметры вида hide_badge/tier сознательно НЕ читаются: решение о badge —
  // серверное (ADR-002). Их отсутствие в коде и есть реализация инварианта.

  if (slug === '') {
    return NextResponse.json(safeDefault('', null), { status: 200, headers: CORS });
  }

  // Домен для FR-GROWTH-001. Origin ставит БРАУЗЕР, а query-параметр — скрипт виджета,
  // то есть сторона, которую атакующий контролирует полностью. Поэтому заголовок в
  // приоритете, а параметр — только фолбэк для окружений, где Origin не приходит.
  const url = new URL(request.url);
  // Нормализуем СРАЗУ и один раз. Сырой Origin — не домен: для file:// и песочниц
  // браузер шлёт литеральное "null", и оно уезжало в utm_content ссылки badge
  // строкой "null" (поймано браузерной проверкой, а не тестом).
  const domain = normalizeDomain(
    request.headers.get('origin') ??
      request.headers.get('referer') ??
      url.searchParams.get('domain'),
  );

  const config = await withService(async (client) => {
    const cfg = await buildWidgetConfig(client, slug, domain);
    // Проект существует ровно тогда, когда слаг совпал с возвращённым (safeDefault
    // отдаёт исходную строку и пустой список — писать установку не для чего).
    const resolved = await client.query<{ id: string }>(
      'select id from projects where slug = $1 and deactivated = false',
      [slug],
    );
    const projectId = resolved.rows[0]?.id;
    if (projectId) {
      await recordInstallAndInviteIfNeeded(client, projectId, domain);
      // badge_impression — на КАЖДЫЙ ответ с badge_required = true (Architecture §6),
      // в отличие от install/invite, которые эмитируются один раз на домен.
      if (cfg.badge_required) {
        await emitEvents(client, projectId, domain, ['badge_impression']);
      }
    }
    return cfg;
  });

  return NextResponse.json(config, { status: 200, headers: CORS });
}
