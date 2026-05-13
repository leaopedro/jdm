import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    deps: {
      external: ['expo-media-library', 'react-native-view-shot'],
    },
  },
});
