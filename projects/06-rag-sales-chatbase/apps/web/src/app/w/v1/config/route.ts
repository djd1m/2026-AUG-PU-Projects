// GET /w/v1/config?bot={public_key} — ResolveWidgetConfig (FR-TARIFF-001, SC-US-011-2); OPTIONS — предполётный.
import { getWidgetDependencies } from '../../../../server/widget-runtime';
import { createWidgetConfigHandler, createWidgetPreflightHandler } from '../../../../server/widget-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> { return createWidgetConfigHandler(getWidgetDependencies())(request); }
export async function OPTIONS(request: Request): Promise<Response> { return createWidgetPreflightHandler(getWidgetDependencies())(request); }
