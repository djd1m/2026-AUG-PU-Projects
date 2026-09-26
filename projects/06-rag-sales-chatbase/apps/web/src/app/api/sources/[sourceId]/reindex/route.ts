// POST /api/sources/{source_id}/reindex — «Обновить» готовый сайт и «Повторить» отказавший (FR-INDEX-004, FR-INDEX-003,
// ADR-009): та же задача, новая серия, неизменные страницы пропускаются по content_hash (фича source-lifecycle).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createSourceReindexHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ sourceId: string }> }): Promise<Response> {
  return createSourceReindexHandler(getCabinetDependencies())(request, (await context.params).sourceId);
}
