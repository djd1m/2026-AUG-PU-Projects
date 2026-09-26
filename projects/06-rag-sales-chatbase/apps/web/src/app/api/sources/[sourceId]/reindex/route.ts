// POST /api/sources/{source_id}/reindex — «Повторить» отказавшую задачу источника (FR-INDEX-003, ADR-009); переиндексация
// готового источника (FR-INDEX-004) — фича source-lifecycle.
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createSourceRetryHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ sourceId: string }> }): Promise<Response> {
  return createSourceRetryHandler(getCabinetDependencies())(request, (await context.params).sourceId);
}
