import type { ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variantFromEnv = (): Variant => {
  const raw = process.env.APP_VARIANT ?? 'development';
  if (raw === 'development' || raw === 'preview' || raw === 'production') return raw;
  return 'development';
};

const variant = variantFromEnv();

const suffix: Record<Variant, string> = {
  development: ' (Dev)',
  preview: ' (Preview)',
  production: '',
};

const bundleId: Record<Variant, string> = {
  development: 'com.jdmexperience.app.dev',
  preview: 'com.jdmexperience.app.preview',
  production: 'com.jdmexperience.app',
};

const config: ExpoConfig = {
  name: `JDM Experience${suffix[variant]}`,
  slug: 'jdm-experience',
  scheme: 'jdm',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0B0F',
  },
  ios: {
    bundleIdentifier: bundleId[variant],
    supportsTablet: false,
  },
  android: {
    package: bundleId[variant],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0B0F',
    },
  },
  plugins: [
    'expo-router',
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT_MOBILE,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '' },
  },
};

export default config;
