import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const main = async () => {
  console.log('[server] loading env…');
  const env = loadEnv();
  console.log('[server] env loaded, building app…');
  const app = await buildApp(env);
  console.log('[server] app built, binding to port %d…', env.PORT);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutdown initiated');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log('[server] listening on 0.0.0.0:%d', env.PORT);
};

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  setTimeout(() => process.exit(1), 200);
});
