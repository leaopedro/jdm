import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@jdm/shared/legal': path.resolve(__dirname, '../../packages/shared/src/legal.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    passWithNoTests: true,
  },
});
