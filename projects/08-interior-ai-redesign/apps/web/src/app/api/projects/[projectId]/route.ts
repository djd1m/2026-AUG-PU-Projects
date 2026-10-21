import { projectHandler } from '../../../../server/handlers';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { return projectHandler('GET', (await context.params).projectId)(request); }
export async function PATCH(request: Request, context: Context) { return projectHandler('PATCH', (await context.params).projectId)(request); }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
