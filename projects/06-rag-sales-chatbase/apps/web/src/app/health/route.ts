// из N5: projects/05-podcast-clips-opus/apps/web/src/app/health/route.ts — адаптировано: здоровье требует
// расширения pgvector (ADR-001): БД без него отвечает на SELECT 1, но индексировать не может.
import { getRuntime } from '../../server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  try {
    const result = await getRuntime().pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    if (result.rowCount !== 1) throw new Error('pgvector не установлен');
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Проверка здоровья: сервис недоступен', error instanceof Error ? error.message : '');
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
