import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    deps: {
      external: ['expo-media-library', 'react-native-view-shot'],
    },
  },
});
