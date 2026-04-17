import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('jdm_test')
    .withUsername('jdm')
    .withPassword('jdm')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.GIT_SHA = 'test';
  process.env.CORS_ORIGINS = '';

  const dbPackageDir = path.resolve(here, '../../../packages/db');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}, 120_000);

afterAll(async () => {
  await container?.stop();
});
