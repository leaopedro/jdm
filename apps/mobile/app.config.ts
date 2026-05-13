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

// Use `||` not `??` so that an empty string in .env.local (a common footgun
// when teammates blank out the var) still falls back to the default instead
// of silently producing an empty projectId — which makes
// Notifications.getExpoPushTokenAsync throw 'no-project-id' and breaks the
// local broadcast push smoke (JDMA-534).
const easProjectId = process.env.EAS_PROJECT_ID || 'c071216e-6224-4f00-9eb0-6737fb5e1691';

const stripeMerchantIdentifier =
  variant === 'production' ? 'merchant.com.jdmexperience.app' : undefined;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProjectMobile = process.env.SENTRY_PROJECT_MOBILE;

const devLauncherPlugins: ExpoConfig['plugins'] =
  variant === 'development'
    ? [
        [
          'expo-dev-launcher',
          {
            launchMode: 'launcher',
          },
        ],
      ]
    : [];

const sentryExpoPlugin: ExpoConfig['plugins'] =
  sentryOrg && sentryProjectMobile
    ? [
        [
          '@sentry/react-native/expo',
          {
            organization: sentryOrg,
            project: sentryProjectMobile,
          },
        ],
      ]
    : [];

const config: ExpoConfig = {
  name: `JDM Experience${suffix[variant]}`,
  slug: 'jdm-experience',
  owner: 'leaopedro',
  scheme: 'jdm',
  version: '0.0.1',
  runtimeVersion: {
    policy: 'appVersion',
  },
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  updates: {
    url: 'https://u.expo.dev/c071216e-6224-4f00-9eb0-6737fb5e1691',
  },
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0B0F',
  },
  ios: {
    bundleIdentifier: bundleId[variant],
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
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
    ...devLauncherPlugins,
    'expo-secure-store',
    [
      '@stripe/stripe-react-native',
      stripeMerchantIdentifier ? { merchantIdentifier: stripeMerchantIdentifier } : {},
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#0B0B0F',
      },
    ],
    ...sentryExpoPlugin,
  ],
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  experiments: { typedRoutes: true },
  extra: {
    variant,
    // `||` (not `??`) so an empty string in .env.local falls back to the
    // default instead of producing an empty baseUrl. See easProjectId above
    // for the same reasoning.
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    stripeMerchantIdentifier,
    eas: { projectId: easProjectId },
  },
};

export default config;
