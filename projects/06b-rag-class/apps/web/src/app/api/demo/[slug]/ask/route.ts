import { demoRoute } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const POST = demoRoute;
// Explicit denial also prevents Next's automatic OPTIONS response from implying access.
export function OPTIONS() {
  return new Response(null, { status: 405, headers: { 'Cache-Control': 'no-store' } });
}
