// POST /api/checkout — инициация оплаты владельцем проекта (FR-008, Pseudocode §7.3).

import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { createRemotePayment, PaymentProviderError, recordCheckoutSession, isStub } from '@/lib/payment';
import { baseUrl } from '@/lib/urls';

export const dynamic = 'force-dynamic';

/**
 * Цена платного тарифа. DEC-001 закрыт решением владельца 2026-09-02: 990 ₽ за 30 дней.
 * Переменная окружения оставлена как способ сменить цену без пересборки, но значение по
 * умолчанию теперь РЕШЕНИЕ, а не заглушка на месте пробела.
 */
const PRICE_RUB = Number(process.env.PAID_TIER_PRICE_RUB ?? '990');

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
    // Обращение к ЮKassa — ВНЕ транзакции: держать соединение пула всё время ответа
    // стороннего сервиса нельзя.
    // Ключ идемпотентности — на КАЖДУЮ попытку свой. Он защищает от повтора ОДНОГО
    // сетевого запроса (таймаут, ретрай клиента HTTP), а не от второго осознанного
    // нажатия: второе нажатие — это законная новая оплата, и общий ключ вернул бы вместо
    // неё прежний платёж, сделав продление невозможным.
    const idempotenceKey = randomUUID();
    const session = await createRemotePayment(
      projectId, PRICE_RUB, `${baseUrl()}/dashboard/${slug}`, idempotenceKey);
    await withAccount(accountId, (client) =>
      recordCheckoutSession(client, projectId, session, idempotenceKey));
    return NextResponse.json({ redirect_url: session.redirectUrl, stub: isStub() }, { status: 200 });
  } catch (err) {
    if (err instanceof PaymentProviderError && err.message === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
      // 501, а не фиктивная ссылка: зелёный checkout при отсутствующей интеграции —
      // ровно тот класс лжи, против которого «сценарий добавлен ≠ требование закрыто».
      return NextResponse.json(
        { error: 'приём оплаты не подключён: задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY (или PAYMENTS_STUB=true)' },
        { status: 501 },
      );
    }
    console.error('checkout_failed', { projectId, err });
    return NextResponse.json({ error: 'не удалось начать оплату, попробуйте позже' }, { status: 502 });
  }
}
