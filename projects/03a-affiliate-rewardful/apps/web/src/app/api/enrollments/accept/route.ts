import { handleApi } from '../../../../lib/onboarding/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return handleApi(request, 'accept', await context.params);
}
