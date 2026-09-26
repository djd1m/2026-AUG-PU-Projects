// POST /api/bots/{bot_id}/publish { enabled, indexable } — демо-страница /b/{slug} (FR-GROWTH-005, public-page-and-summary).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createBotPublishHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createBotPublishHandler(getCabinetDependencies())(request, (await context.params).botId);
}
