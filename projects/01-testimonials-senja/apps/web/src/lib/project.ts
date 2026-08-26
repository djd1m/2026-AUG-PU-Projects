// Резолв проекта по слагу для публичных страниц.
//
// Путь анонимный → роль app_service (BYPASSRLS). Предупреждение packages/db/src/tenant.ts
// применимо буквально: RLS здесь не защищает ничего. Поэтому наружу принимается ТОЛЬКО slug,
// никогда project_id от клиента, а все дальнейшие выборки фильтруются по project_id,
// полученному здесь.

import { withService } from '@proofwall/db';

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
