// POST /api/widget/badge-click — FR-GROWTH-003, событие badge_click.
//
// Виджет шлёт сюда navigator.sendBeacon при клике по badge (Architecture §6).
// sendBeacon не ждёт ответа и не умеет читать его — поэтому роут обязан быть
// быстрым и не имеет права влиять на переход по ссылке: браузер уводит
// пользователя параллельно, и любая задержка здесь просто теряет событие.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { emitEvents, normalizeDomain } from '@/lib/widget-install';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'no-store',
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    // sendBeacon отправляет Blob с content-type: application/json.
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  const slug = (body as { slug?: unknown })?.slug;
  if (typeof slug !== 'string' || slug === '') {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  // Домен, как и в конфиге, берём из заголовка браузера, а не из тела запроса.
  const domain = normalizeDomain(
    request.headers.get('origin') ?? request.headers.get('referer') ?? (body as { domain?: string })?.domain,
  );

  await withService(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'select id from projects where slug = $1 and deactivated = false',
      [slug],
    );
    const projectId = rows[0]?.id;
    // Неизвестный слаг — молча ничего не пишем. Это анонимный эндпоинт: отвечать
    // «такого проекта нет» значило бы отдать наружу перечислитель проектов.
    if (projectId) await emitEvents(client, projectId, domain, ['badge_click']);
  });

  // 204 всегда: sendBeacon всё равно не читает тело, а различимый ответ дал бы
  // возможность перебирать существующие слаги.
  return new NextResponse(null, { status: 204, headers: CORS });
}
