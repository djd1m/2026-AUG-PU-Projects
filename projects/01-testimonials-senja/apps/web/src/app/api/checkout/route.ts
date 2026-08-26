// POST /api/checkout — FR-008, инициация оплаты владельцем проекта (Pseudocode §7.3).

import { NextResponse } from 'next/server';
import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { recordCheckoutSession, type CheckoutProvider } from '@/lib/payment';

export const dynamic = 'force-dynamic';

/**
 * Провайдер оплаты не выбран ни одним документом проекта ([GAP] в 005_payments.sql).
 * Заглушка НЕ притворяется рабочей: без явного PAYMENT_PROVIDER_URL роут отвечает 501,
 * а не выдаёт фиктивную ссылку. Зелёный checkout при отсутствующей интеграции —
 * ровно тот класс лжи, против которого написано правило «сценарий добавлен ≠ требование
 * закрыто» (p-replicator-known-gaps.md §3).
 */
const provider: CheckoutProvider = async (projectId) => {
  const base = process.env.PAYMENT_PROVIDER_URL;
  if (!base) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
  const res = await fetch(`${base.replace(/\/+$/, '')}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) throw new Error(`провайдер оплаты ответил ${res.status}`);
  const data = (await res.json()) as { session_id?: string; redirect_url?: string };
  if (!data.session_id || !data.redirect_url) throw new Error('провайдер вернул неполный ответ');
  return { providerSessionId: data.session_id, redirectUrl: data.redirect_url };
};

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
  if (typeof slug !== 'string' || slug === '') {
    return NextResponse.json({ error: 'slug: обязателен' }, { status: 400 });
  }

  // Владение — через RLS: чужой проект просто не вернётся.
  const projectId = await withAccount(accountId, async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from projects where slug = $1', [slug]);
    return rows[0]?.id ?? null;
  });
  if (!projectId) return NextResponse.json({ error: 'не найдено' }, { status: 404 });

  try {
    // Провайдер вызывается ВНЕ транзакции: держать соединение пула всё время ответа
    // стороннего сервиса нельзя. Строка пишется сразу после — до того, как владелец
    // успеет оплатить и вебхук придёт искать, к какому проекту относится сессия.
    const session = await provider(projectId);
    await withAccount(accountId, (client) => recordCheckoutSession(client, projectId, session));
    return NextResponse.json({ redirect_url: session.redirectUrl }, { status: 200 });
  } catch (err) {
    if ((err as Error).message === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'приём оплаты не подключён: не задан PAYMENT_PROVIDER_URL' },
        { status: 501 },
      );
    }
    console.error('checkout_failed', { projectId, err });
    return NextResponse.json({ error: 'не удалось начать оплату, попробуйте позже' }, { status: 502 });
  }
}
