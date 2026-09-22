export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getRuntime } = await import('./server/runtime');
    getRuntime(); // Ошибка конфигурации завершает запуск до приёма первого запроса.
  }
}
