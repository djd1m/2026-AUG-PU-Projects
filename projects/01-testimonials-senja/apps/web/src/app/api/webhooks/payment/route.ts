// POST /api/webhooks/payment — уведомления ЮKassa (FR-008, ADR-006, D-009).
//
// Порядок шагов — требование, а не стиль: подлинность подтверждается ДО записи
// event_id. При обратном порядке подделка с угаданным идентификатором вытеснит
// настоящее уведомление, и оплата не применится никогда.
//
// Отсюда же следует НЕОЧЕВИДНОЕ: недоступность провайдера обязана быть ИСКЛЮЧЕНИЕМ,
// а не возвращаемым значением. withService коммитит транзакцию при штатном возврате
// из колбэка — значит заявка на event_id останется в базе. Мы при этом отдаём 500,
// ЮKassa повторяет уведомление, повтор упирается в занятый event_id и коротит в
// 'duplicate' с кодом 200. Оплата не применяется НИКОГДА: деньги списаны, тариф не
// повышен, повторить нечем. Брошенное исключение откатывает транзакцию и освобождает
// заявку — только тогда повтор действительно повторяет.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import {
  applyTariffUpgrade,
  claimWebhookEvent,
  fetchRemotePayment,
  PaymentProviderError,
  verifyWebhookOrigin,
} from '@/lib/payment';
import { convertAttributionOnPayment } from '@/lib/referral';
import { extractClientIP } from '@/lib/client-ip';

export const dynamic = 'force-dynamic';

/**
 * Провайдер недоступен. Именно исключение, а не значение: оно обязано откатить
 * транзакцию вместе с заявкой на event_id — см. шапку файла.
 */
class ProviderUnavailable extends Error {
  constructor() {
    super('payment provider unavailable');
    this.name = 'ProviderUnavailable';
  }
}

async function audit(action: string, actor: string, reason: string): Promise<void> {
  await withService((client) =>
    client.query(
      // project_id = null: на этом шаге проект ещё неизвестен, событие привязано к источнику.
      `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
       values (null, 'webhook', gen_random_uuid(), $1, $2, $3)`,
      [actor, action, reason],
    ),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = extractClientIP(request);

  // ── ШАГ 1: адрес источника из списка сетей ЮKassa ───────────────────────
  const origin = verifyWebhookOrigin(ip);
  if (!origin.ok) {
    await audit('webhook_origin_rejected', ip, origin.reason);
    // 400, а не 200: у ЮKassa отказ должен быть виден, а не проглочен.
    return NextResponse.json({ error: 'unknown origin' }, { status: 400 });
  }

  let body: {
    event?: unknown;
    object?: { id?: unknown; status?: unknown; metadata?: Record<string, unknown> };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const event = typeof body.event === 'string' ? body.event : '';
  const paymentId = typeof body.object?.id === 'string' ? body.object.id : '';
  if (event === '' || paymentId === '') {
    return NextResponse.json({ error: 'event and object.id required' }, { status: 400 });
  }

  // У ЮKassa нет отдельного идентификатора события — есть тип события и id объекта.
  // Пара из них устойчива и различает payment.succeeded и payment.canceled по одному платежу.
  const eventId = `${event}:${paymentId}`;

  let outcome: 'duplicate' | 'ignored' | 'unknown_payment' | 'not_paid' | 'upgraded' | 'unknown_session';
  try {
    outcome = await withService(async (client) => {
      // ── ШАГ 2: идемпотентность на уровне схемы ────────────────────────────
      if (!(await claimWebhookEvent(client, eventId, body))) return 'duplicate' as const;
      if (event !== 'payment.succeeded') return 'ignored' as const;

      // ── ШАГ 3: статус перезапрашивается у ЮKassa ──────────────────────────
      // Тело уведомления не является источником истины о том, оплачено ли. Этот шаг
      // сильнее проверки адреса: он не зависит от точности определения IP.
      let remote;
      try {
        remote = await fetchRemotePayment(paymentId);
      } catch (err) {
        // НЕ `return`: штатный возврат закоммитил бы заявку на event_id (см. шапку).
        if (err instanceof PaymentProviderError) throw new ProviderUnavailable();
        throw err;
      }
      if (!remote) return 'unknown_payment' as const;
      if (!remote.paid || remote.status !== 'succeeded') return 'not_paid' as const;

      // ── ШАГ 4: тариф ──────────────────────────────────────────────────────
      const upgrade = await applyTariffUpgrade(client, paymentId);

      // ── ШАГ 5: партнёрское начисление (FR-GROWTH-002) ─────────────────────
      const accountId = body.object?.metadata?.['account_id'];
      if (typeof accountId === 'string' && accountId !== '') {
        await convertAttributionOnPayment(client, accountId, eventId, remote.amount);
      }

      return upgrade.applied ? ('upgraded' as const) : ('unknown_session' as const);
    });
  } catch (err) {
    if (err instanceof ProviderUnavailable) {
      // 500 намеренно: ЮKassa повторит уведомление, и это правильный исход — мы не
      // смогли проверить платёж, а не отвергли его. Заявка на event_id откачена
      // вместе с транзакцией, поэтому повтор пройдёт по полному пути, а не в duplicate.
      return NextResponse.json({ status: 'provider_unavailable' }, { status: 500 });
    }
    throw err;
  }

  // 200 на всё остальное: ЮKassa повторяет, пока не получит 200, и ретраить то,
  // что мы сознательно проигнорировали, незачем.
  return NextResponse.json({ status: outcome }, { status: 200 });
}
