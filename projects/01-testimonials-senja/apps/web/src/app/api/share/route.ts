// POST /api/share — FR-GROWTH-001, событие invite_sent (Architecture §6:
// «Владелец подтвердил диалог публикации»).
//
// Роут вызывается ТОЛЬКО после явного подтверждения владельцем. Само подтверждение —
// на клиенте (share-cta.tsx): до него не уходит ни одного запроса, ни к нам, ни наружу
// (@security сценарий FR-GROWTH-001). Сервер здесь ничего никуда не публикует — он лишь
// фиксирует, что владелец воспользовался шерингом; публикация выполняется системным
// диалогом самого устройства.

import { NextResponse } from 'next/server';
import { withAccount, withService } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { emitEvents } from '@/lib/widget-install';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.json({ error: 'требуется вход' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'тело запроса: ожидается JSON' }, { status: 400 });
  }
  const slug = (body as { slug?: unknown })?.slug;
  const domain = (body as { domain?: unknown })?.domain;
  if (typeof slug !== 'string' || slug === '') {
    return NextResponse.json({ error: 'slug: обязателен' }, { status: 400 });
  }

  // Владение проверяется через RLS: чужой слаг просто не вернётся.
  const projectId = await withAccount(accountId, async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from projects where slug = $1', [slug]);
    return rows[0]?.id ?? null;
  });
  if (!projectId) return NextResponse.json({ error: 'не найдено' }, { status: 404 });

  await withService((client) =>
    emitEvents(client, projectId, typeof domain === 'string' ? domain : null, ['invite_sent']),
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
