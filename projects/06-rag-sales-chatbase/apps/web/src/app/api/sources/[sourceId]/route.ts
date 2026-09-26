// DELETE /api/sources/{source_id} — удалить источник с его страницами и фрагментами одной транзакцией
// (FR-INDEX-004, Pseudocode DeleteSource, SC-US-014-2; фича source-lifecycle).
import { getCabinetDependencies } from '../../../../server/cabinet-runtime';
import { createSourceDeleteHandler } from '../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{ sourceId: string }> }): Promise<Response> {
  return createSourceDeleteHandler(getCabinetDependencies())(request, (await context.params).sourceId);
}
