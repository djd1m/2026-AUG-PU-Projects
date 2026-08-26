// POST /api/testimonials/<id>/moderate — FR-004.
// Дашборд-путь: требует проверенной сессии владельца (Architecture §3.2).

import { NextResponse } from 'next/server';
import { withAccount, withService } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import {
  applyTransition,
  isAllowedTransition,
  logCrossProjectDenial,
  resolveOwnership,
  type Status,
} from '@/lib/moderation';
import { recomputeContentThreshold } from '@/lib/content-threshold';

export const dynamic = 'force-dynamic';

const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'hidden'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.json({ error: 'требуется вход' }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'не найдено' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'тело запроса: ожидается JSON' }, { status: 400 });
  }
  const target = (body as { status?: unknown })?.status;
  if (typeof target !== 'string' || !STATUSES.includes(target as Status)) {
    return NextResponse.json({ error: `status: ожидается один из ${STATUSES.join(', ')}` }, { status: 400 });
  }

  const own = await withService((c) => resolveOwnership(c, id, accountId));

  if (!own.exists) return NextResponse.json({ error: 'не найдено' }, { status: 404 });

  if (!own.owned) {
    // Событие безопасности фиксируется до ответа — отказ не должен быть бесследным.
    await withService((c) => logCrossProjectDenial(c, id, accountId));
    return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  }

  const from = own.status!;
  const to = target as Status;
  if (!isAllowedTransition(from, to)) {
    return NextResponse.json({ error: `недопустимый переход ${from} -> ${to}` }, { status: 400 });
  }

  // Переход и пересчёт порога — ОДНА транзакция: иначе между ними существует момент,
  // когда отзыв уже одобрен, а noindex ещё не снят (или наоборот), и краш в этом окне
  // оставил бы индексируемость рассогласованной с контентом.
  const outcome = await withAccount(accountId, async (c) => {
    const applied = await applyTransition(c, id, from, to, accountId);
    if (!applied) return null;
    // Пересчёт нужен только когда меняется множество approved (Pseudocode §2).
    const touchesApproved = from === 'approved' || to === 'approved';
    const threshold = touchesApproved ? await recomputeContentThreshold(c, own.projectId!) : null;
    return { threshold };
  });

  if (!outcome) {
    // 0 строк — состояние успели сменить параллельно (или RLS не пустила).
    return NextResponse.json({ error: 'состояние изменилось, обновите страницу' }, { status: 409 });
  }

  return NextResponse.json(
    {
      id,
      from,
      to,
      ...(outcome.threshold ? { indexable: !outcome.threshold.noindex } : {}),
    },
    { status: 200 },
  );
}
