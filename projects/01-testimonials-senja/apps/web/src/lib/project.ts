// Резолв проекта по слагу для публичных страниц.
//
// Путь анонимный → роль app_service (BYPASSRLS). Предупреждение packages/db/src/tenant.ts
// применимо буквально: RLS здесь не защищает ничего. Поэтому наружу принимается ТОЛЬКО slug,
// никогда project_id от клиента, а все дальнейшие выборки фильтруются по project_id,
// полученному здесь.

import { withService } from '@proofwall/db';
import type { PoolClient } from 'pg';
import { buildProjectUrls, type ProjectUrls } from './urls';

export interface PublicProject {
  id: string;
  slug: string;
  tier: 'free' | 'paid';
  noindex: boolean;
  branding: Record<string, unknown>;
}

export async function findProjectBySlug(slug: string): Promise<PublicProject | null> {
  return withService(async (client) => {
    const { rows } = await client.query<PublicProject>(
      `select id, slug, tier, noindex, branding
         from projects
        where slug = $1 and deactivated = false`,
      [slug],
    );
    return rows[0] ?? null;
  });
}

export interface ProjectSummary {
  slug: string;
  urls: ProjectUrls;
}

/**
 * Все проекты аккаунта (FR-009.4). Список, а не один: схема (`003_core.sql:32`) допускает
 * несколько проектов на аккаунт, и допущение «ровно один» сломалось бы при первой же фиче
 * создания второго.
 *
 * Порядок по `created_at` ДЕТЕРМИНИРОВАН намеренно: после входа браузер идёт в кабинет
 * первого, и «какой попадётся» здесь было бы наблюдаемым непостоянством (FR-009.5).
 *
 * Клиент передаётся снаружи: вызывающий уже в транзакции входа.
 */
export async function listProjectsForAccount(
  client: PoolClient,
  accountId: string,
): Promise<ProjectSummary[]> {
  const { rows } = await client.query<{ slug: string }>(
    `select slug from projects
      where account_id = $1 and deactivated = false
      order by created_at, slug`,
    [accountId],
  );
  return rows.map((r) => ({ slug: r.slug, urls: buildProjectUrls(r.slug) }));
}
