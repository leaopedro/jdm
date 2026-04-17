import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
