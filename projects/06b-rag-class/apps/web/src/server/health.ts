// GET /api/health (NFR-n6b-5): 200 только если конфигурация прошла проверку И БД ответила. Неизвестное состояние —
// 503, а не «ok» (honest-configuration: не изготавливать здоровье). Секреты и текст ошибки наружу не выходят.

export type HealthProbe = () => Promise<void>;

export function createHealthHandler(probe: HealthProbe) {
  return async (): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      await probe();
      return Response.json({ data: { status: 'ok', db: 'ok' } }, { status: 200, headers });
    } catch (error) {
      console.error(`health: проверка не прошла: ${(error as Error).name}`);
      return Response.json({ error: { code: 'unhealthy', message: 'Сервис недоступен' } }, { status: 503, headers });
    }
  };
}
