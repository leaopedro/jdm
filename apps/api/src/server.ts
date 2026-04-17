import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const main = async () => {
  const env = loadEnv();
  const app = await buildApp(env);

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
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
