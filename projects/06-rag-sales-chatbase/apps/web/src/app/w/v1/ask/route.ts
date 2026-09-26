// POST /w/v1/ask?bot={public_key} { visitor_session, question } — вопрос посетителя виджета (FR-WIDGET-002, FR-LIMIT-001,
// A-N6-035); OPTIONS — предполётный запрос по списку ЭТОГО бота.
import { getWidgetDependencies } from '../../../../server/widget-runtime';
import { createWidgetAskHandler } from '../../../../server/widget-ask-handler';
import { createWidgetPreflightHandler } from '../../../../server/widget-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return createWidgetAskHandler(getWidgetDependencies())(request); }
export async function OPTIONS(request: Request): Promise<Response> { return createWidgetPreflightHandler(getWidgetDependencies())(request); }
