// GET /w/widget.<hash>.js — бандл виджета (канон §5); старый хэш получает текущий бандл (widget-bundle.ts, A-N6-034).
import { createWidgetBundleHandler, readWidgetBundle, type WidgetBundle } from '../../../server/widget-bundle';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Бандл неизменен в пределах процесса (он часть образа): читается с диска один раз.
let cached: Promise<WidgetBundle | null> | undefined;
const handler = createWidgetBundleHandler(() => (cached ??= readWidgetBundle()));
export async function GET(request: Request, context: { params: Promise<{ file: string }> }): Promise<Response> {
  return handler(request, (await context.params).file);
}
