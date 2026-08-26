// POST /api/webhooks/payment — FR-008, ADR-006.
//
// Порядок шагов ниже — не стилистика, а требование Pseudocode §7.2. Менять его нельзя:
// проверка подписи ОБЯЗАНА идти до записи event_id, иначе подделка с угаданным id
// вытесняет настоящий вебхук, и оплата не применяется никогда.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { applyTariffUpgrade, claimWebhookEvent, verifyWebhookSignature } from '@/lib/payment';
import { extractClientIP } from '@/lib/client-ip';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // СЫРОЕ тело: HMAC считается по нему побайтово. request.json() здесь недопустим —
  // пере-сериализация сломала бы подпись даже при верном содержимом.
  const rawBody = await request.text();

  // ── ШАГ 1: подпись, до всего остального ─────────────────────────────────
  const verdict = verifyWebhookSignature(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
  );

  if (!verdict.ok) {
    const action = verdict.reason === 'stale' ? 'webhook_timestamp_stale' : 'webhook_signature_invalid';
    await withService((client) =>
      client.query(
        // project_id = null: на этом шаге проект ещё неизвестен — событие привязано к источнику.
        `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
         values (null, 'webhook', gen_random_uuid(), $1, $2, $3)`,
        [extractClientIP(request), action, verdict.reason],
      ),
    );
    // 400, а НЕ 200: провайдер должен увидеть отказ и повторить/поднять тревогу.
    return NextResponse.json({ error: 'invalid webhook' }, { status: 400 });
  }

  // ── ШАГ 2: разбор ТОЛЬКО после проверки подписи ─────────────────────────
  let event: { id?: unknown; type?: unknown; checkout_session_id?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (typeof event.id !== 'string' || event.id === '') {
    return NextResponse.json({ error: 'event id required' }, { status: 400 });
  }

  const outcome = await withService(async (client) => {
    // ── ШАГ 3: идемпотентность на уровне схемы ────────────────────────────
    const isNew = await claimWebhookEvent(client, event.id as string, event);
    if (!isNew) return 'duplicate' as const;

    if (event.type !== 'payment_succeeded') return 'ignored' as const;
    if (typeof event.checkout_session_id !== 'string' || event.checkout_session_id === '') {
      return 'no_session' as const;
    }

    // ── ШАГ 4: применение тарифа ──────────────────────────────────────────
    const upgrade = await applyTariffUpgrade(client, event.checkout_session_id);
    return upgrade.applied ? ('upgraded' as const) : ('unknown_session' as const);

    // FR-GROWTH-002 (начисление партнёру и проверка self-referral) подключается здесь же,
    // после апгрейда — приходит со своей фичей роадмапа.
  });

  // 200 на всё, что прошло подпись: провайдер не должен ретраить события, которые мы
  // сознательно проигнорировали (дубль, чужой тип, неизвестная сессия) — иначе он
  // будет долбить их до исчерпания своих попыток.
  return NextResponse.json({ status: outcome }, { status: 200 });
}
