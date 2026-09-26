// POST /api/preview — CreatePreview (фича preview-flow, FR-PREVIEW-001, FR-LIMIT-002). Оформление — как у
// POST /api/bots/{bot_id}/sources: runtime nodejs, зависимости из getPreviewDependencies().
import { getPreviewDependencies } from '../../../server/preview-runtime';
import { createPreviewCreateHandler } from '../../../server/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createPreviewCreateHandler(getPreviewDependencies())(request);
}
