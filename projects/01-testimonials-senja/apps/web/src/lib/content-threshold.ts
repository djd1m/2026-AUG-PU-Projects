// FR-GROWTH-005 — порог содержательности и noindex. Источник: Pseudocode §6, ADR-004.
//
// Зачем: /w/<slug> создаётся у КАЖДОГО нового проекта и до первых отзывов представляет
// собой пустую страницу. Отдать поисковику тысячи таких — это scaled content abuse,
// за который наказывают весь домен, а не отдельный слаг. Поэтому новый проект рождается
// с noindex=true (см. register.ts), и снять его может только реальный контент.

import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';

export const CONTENT_THRESHOLD = { minApprovedCount: 3, minTotalChars: 400 };

export const BULK_SCOPE = 'project_created';
export const BULK_WINDOW = { seconds: 3600 };
export const BULK_THRESHOLD = 20; // проектов в час на аккаунт

export interface ThresholdResult {
  meetsThreshold: boolean;
  approvedCount: number;
  totalChars: number;
  changed: boolean;
  noindex: boolean;
}

/**
 * Pseudocode §6 recomputeContentThreshold. Двусторонняя и идемпотентная: одна и та же
 * функция и снимает noindex, и накладывает его обратно, а когда состояние уже совпадает
 * с расчётом — не пишет в audit_log вовсе.
 *
 * Вызывается при КАЖДОМ изменении статуса, влияющем на множество approved (Pseudocode §2).
 */
export async function recomputeContentThreshold(
  client: PoolClient,
  projectId: string,
): Promise<ThresholdResult> {
  const { rows } = await client.query<{ count: string; chars: string }>(
    // Транскрипт НЕ считается текстовым контентом (Pseudocode §6): машинная расшифровка
    // не то же самое, что написанный человеком отзыв, и порог на ней набирать нельзя.
    `select count(*)::text as count, coalesce(sum(length(text)), 0)::text as chars
       from testimonials
      where project_id = $1 and status = 'approved'`,
    [projectId],
  );
  const approvedCount = Number(rows[0]?.count ?? 0);
  const totalChars = Number(rows[0]?.chars ?? 0);

  const meetsThreshold =
    approvedCount >= CONTENT_THRESHOLD.minApprovedCount && totalChars >= CONTENT_THRESHOLD.minTotalChars;

  const cur = await client.query<{ noindex: boolean }>('select noindex from projects where id = $1', [
    projectId,
  ]);
  const current = cur.rows[0];
  if (!current) {
    return { meetsThreshold, approvedCount, totalChars, changed: false, noindex: true };
  }

  if (meetsThreshold && current.noindex) {
    await setNoindex(client, projectId, false, 'threshold_met', 'noindex_removed');
    return { meetsThreshold, approvedCount, totalChars, changed: true, noindex: false };
  }
  if (!meetsThreshold && !current.noindex) {
    await setNoindex(client, projectId, true, 'below_threshold', 'noindex_applied');
    return { meetsThreshold, approvedCount, totalChars, changed: true, noindex: true };
  }

  // Состояние уже соответствует расчёту — ничего не пишем (идемпотентность).
  return { meetsThreshold, approvedCount, totalChars, changed: false, noindex: current.noindex };
}

async function setNoindex(
  client: PoolClient,
  projectId: string,
  value: boolean,
  reason: string,
  action: string,
): Promise<void> {
  await client.query('update projects set noindex = $1 where id = $2', [value, projectId]);
  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
     values ($1, 'project', $1, 'system', $2, $3)`,
    [projectId, action, reason],
  );
}

/**
 * Pseudocode §6, anti-abuse: массовое создание проектов одним аккаунтом.
 *
 * Отдельного столбца `forced` в схеме нет намеренно — и это верно по смыслу: принудительный
 * noindex снимается ТЕМ ЖЕ recomputeContentThreshold, то есть исключительно за счёт реального
 * контента. Обходного пути нет, а отличие «почему скрыт» живёт в audit_log, где ему и место.
 */
export async function onProjectCreated(
  client: PoolClient,
  accountId: string,
  projectId: string,
): Promise<{ forcedNoindex: boolean; count: number }> {
  await rateLimit.record(BULK_SCOPE, accountId, client);
  const count = await rateLimit.count(BULK_SCOPE, accountId, BULK_WINDOW, client);

  if (count >= BULK_THRESHOLD) {
    // Проект и так создаётся с noindex=true; здесь важна не смена флага, а СЛЕД в аудите:
    // без него «почему не индексируется» превращается в загадку.
    await client.query('update projects set noindex = true where id = $1', [projectId]);
    await client.query(
      `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
       values ($1, 'project', $1, $2, 'forced_noindex_bulk_creation', 'over_20_projects_per_hour')`,
      [projectId, accountId],
    );
    return { forcedNoindex: true, count };
  }
  return { forcedNoindex: false, count };
}
