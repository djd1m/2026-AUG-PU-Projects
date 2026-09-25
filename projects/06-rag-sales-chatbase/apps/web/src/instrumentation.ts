// из N5: projects/05-podcast-clips-opus/apps/web/src/instrumentation.ts — без сторожа очереди (фича index-job-core)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getRuntime } = await import('./server/runtime');
    getRuntime(); // Второй рубеж; обязательный отказ старта обеспечивает отдельный preflight.
  }
}
