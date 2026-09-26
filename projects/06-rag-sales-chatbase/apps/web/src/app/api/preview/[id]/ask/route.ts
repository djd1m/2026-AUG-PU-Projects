// POST /api/preview/{index_job_id}/ask — вопрос в предпросмотре (ядро answerQuestion, режим preview).
import { getPreviewDependencies } from '../../../../../server/preview-runtime';
import { createPreviewAskHandler } from '../../../../../server/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return createPreviewAskHandler(getPreviewDependencies())(request, (await context.params).id);
}
