// POST /api/preview/{index_job_id}/share — нажатие «Поделиться ссылкой на бота» (FR-GROWTH-001, public-page-and-summary).
import { getPreviewDependencies } from '../../../../../server/preview-runtime';
import { createPreviewShareHandler } from '../../../../../server/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return createPreviewShareHandler(getPreviewDependencies())(request, (await context.params).id);
}
