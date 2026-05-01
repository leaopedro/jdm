import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const fatal = (label: string, err: unknown): never => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[server] ${label}: ${msg}\n`);
  process.exit(1);
};

process.on('uncaughtException', (err) => fatal('uncaughtException', err));
process.on('unhandledRejection', (err) => fatal('unhandledRejection', err));

const main = async () => {
  process.stderr.write('[server] loading env\n');
  const env = loadEnv();
  process.stderr.write(`[server] env loaded (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT})\n`);

  const app = await buildApp(env);
  process.stderr.write('[server] app built, binding port\n');

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
  process.stderr.write(`[server] listening on 0.0.0.0:${env.PORT}\n`);
};

main().catch((err) => fatal('startup failed', err));
