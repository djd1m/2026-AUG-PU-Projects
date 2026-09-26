// POST /w/v1/event { bot, visitor_session, type ∈ {badge_impression, badge_click} } — RecordGrowthEvent (FR-GROWTH-003).
import { getWidgetDependencies } from '../../../../server/widget-runtime';
import { createWidgetEventHandler, createWidgetPreflightHandler } from '../../../../server/widget-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return createWidgetEventHandler(getWidgetDependencies())(request); }
export async function OPTIONS(request: Request): Promise<Response> { return createWidgetPreflightHandler(getWidgetDependencies())(request); }
