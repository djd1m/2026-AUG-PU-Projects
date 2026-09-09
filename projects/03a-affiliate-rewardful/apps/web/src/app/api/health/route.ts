export function GET(): Response {
  return Response.json({ status: 'alive' }, { headers: { 'Cache-Control': 'no-store' } });
}
