// GET /api/widget/config?slug=...&domain=... — единственный сетевой запрос виджета
// (Architecture §4.2; канонический путь — Architecture §10, НЕ /api/widget-config).

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { buildWidgetConfig, safeDefault } from '@/lib/widget-config';

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
    return NextResponse.json(safeDefault(''), { status: 200, headers: CORS });
  }

  // FR-GROWTH-001 (widget_installed / invite_shown по паре project_id+domain) и
  // badge_impression пишутся ЭТИМ ЖЕ роутом — они приходят со своими фичами роадмапа.

  const config = await withService((client) => buildWidgetConfig(client, slug));
  return NextResponse.json(config, { status: 200, headers: CORS });
}
