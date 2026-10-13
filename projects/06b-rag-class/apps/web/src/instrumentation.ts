// Boot config check при старте сервера Next.js: непригодная конфигурация → exit 1 с именем переменной и последствием
// (SC-US-016-2). Во время `next build` register() не вызывается — сборке внешний адрес и пределы не нужны.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { enforceBootConfig } = await import('@n6b/db');
  const { loadWebConfig } = await import('./server/config');
  enforceBootConfig(() => loadWebConfig());
}
