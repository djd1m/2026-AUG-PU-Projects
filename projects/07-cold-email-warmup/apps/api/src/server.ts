import fastify from 'fastify';
import { loadConfig } from './config.ts';
import { registerCoreRoutes } from './routes.ts';
import { registerCampaignBillingRoutes } from './routes2.ts';

export async function startServer() {
  const cfg = await loadConfig();
  const app = fastify({ logger: { level: cfg.demoMode ? 'info' : 'warn' } });
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    done();
  });

  registerCoreRoutes(app, cfg);
  registerCampaignBillingRoutes(app, cfg);

  const demoHandlers = await import('./demo.ts');
  await demoHandlers.setup(cfg);

  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  return app;
}

if (import.meta.url.endsWith('server.ts')) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}
