// FR-004 — модерация отзывов. Источник: Pseudocode §2, Specification FR-004.
//
// Почему проверка владения СВОЯ, а не «RLS справится». Под app_authenticated чужой отзыв
// просто невидим, и getTestimonial вернул бы null → 404. Спецификация же требует различать
// «нет такого отзыва» и «отзыв есть, но чужой» — второе даёт 403 И запись в audit_log
// (FR-NFR-SEC-001). Поэтому принадлежность резолвится явно под app_service, а RLS остаётся
// вторым, независимым рубежом на самом UPDATE.

import type { PoolClient } from 'pg';

export type Status = 'pending' | 'approved' | 'rejected' | 'hidden';

/** Pseudocode §2. Обратимость намеренная: владелец может передумать. */
export const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  pending: ['approved', 'rejected'],
  approved: ['rejected', 'hidden'],
  rejected: ['approved', 'hidden'],
  hidden: ['approved', 'rejected'],
};

export function isAllowedTransition(from: Status, to: Status): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type ModerateResult =
  | { ok: true; status: 200; from: Status; to: Status }
  | { ok: false; status: 400; body: { error: string } }
  | { ok: false; status: 403; body: { error: string } }
  | { ok: false; status: 404; body: { error: string } };

/**
 * Резолв владения под app_service (BYPASSRLS) — единственный способ отличить 404 от 403.
 * Наружу не отдаётся ничего, кроме факта принадлежности: сам отзыв читается уже под RLS.
 */
export async function resolveOwnership(
  serviceClient: PoolClient,
  testimonialId: string,
  accountId: string,
): Promise<{ exists: boolean; owned: boolean; status?: Status; projectId?: string }> {
  const { rows } = await serviceClient.query<{ status: Status; project_id: string; account_id: string }>(
    `select t.status, t.project_id, p.account_id
       from testimonials t join projects p on p.id = t.project_id
      where t.id = $1`,
    [testimonialId],
  );
  const row = rows[0];
  if (!row) return { exists: false, owned: false };
  return { exists: true, owned: row.account_id === accountId, status: row.status, projectId: row.project_id };
}

/**
 * Сам переход — под app_authenticated (RLS). WHERE по project_id намеренно НЕ дублируется:
 * если политика вдруг не сработает, тест на чужой отзыв это поймает.
 */
export async function applyTransition(
  accountClient: PoolClient,
  testimonialId: string,
  from: Status,
  to: Status,
  accountId: string,
): Promise<boolean> {
  const upd = await accountClient.query(
    `update testimonials set status = $1, moderated_at = now()
      where id = $2 and status = $3`,
    // status = $3 в условии — оптимистичная блокировка: если состояние успели сменить
    // в другой вкладке, обновится 0 строк, и мы не затрём чужой переход молча.
    [to, testimonialId, from],
  );
  if ((upd.rowCount ?? 0) === 0) return false;

  await accountClient.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
     select project_id, 'testimonial', id, $2, 'state_transition', $3
       from testimonials where id = $1`,
    [testimonialId, accountId, `${from} -> ${to}`],
  );
  return true;
}

/** Отказ по чужому проекту фиксируется всегда — это событие безопасности, а не шум. */
export async function logCrossProjectDenial(
  serviceClient: PoolClient,
  testimonialId: string,
  accountId: string,
): Promise<void> {
  // project_id = null: событие привязано к АКТОРУ, а не к проекту, в который он не вхож
  // (003_core/008_audit: колонка nullable ровно для таких случаев).
  await serviceClient.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action)
     values (null, 'testimonial', $1, $2, 'moderation_denied_cross_project')`,
    [testimonialId, accountId],
  );
}
