export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getRuntime } = await import('./server/runtime');
    const { startQueueWatchdog } = await import('./server/queue-runtime');
    startQueueWatchdog();
    getRuntime(); // Второй рубеж; обязательный отказ старта обеспечивает отдельный preflight.
  }
}
