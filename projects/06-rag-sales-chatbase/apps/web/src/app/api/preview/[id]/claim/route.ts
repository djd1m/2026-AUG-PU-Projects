// POST /api/preview/{index_job_id}/claim — ClaimPreview для уже вошедшего владельца (FR-PREVIEW-002).
import { getPreviewDependencies } from '../../../../../server/preview-runtime';
import { createPreviewClaimHandler } from '../../../../../server/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return createPreviewClaimHandler(getPreviewDependencies())(request, (await context.params).id);
}
