import '../global.css';

import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Redirect, Slot, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AuthProvider, useAuth } from '~/auth/context';
import { buildLoginHref, isPublicPath, sanitizeNext } from '~/auth/redirect-intent';
import { initSentry } from '~/lib/sentry';
import { ToastHost } from '~/lib/toast';
import { StoreRuntimeProvider } from '~/store/runtime-context';
import { theme } from '~/theme';

// Override @react-navigation default light bg ('rgb(242,242,242)') so the
// Stack/Tabs/SafeAreaView containers paint #0A0A0A on web — without this
// the unfilled portion of every screen below the form bleeds the light
// default theme through the mobile shell on the web export.
const jdmNavTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    background: '#0a0a0a',
    card: '#0a0a0a',
    text: '#f5f5f5',
    primary: '#e10600',
    border: '#2a2a2a',
    notification: '#e10600',
  },
};

const Gate = () => {
  const auth = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ next?: string }>();
  const next = sanitizeNext(params.next);
  const inAuth =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify');

  if (auth.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  if (auth.status === 'unauthenticated' && !inAuth && !isPublicPath(pathname)) {
    return <Redirect href={buildLoginHref(pathname) as never} />;
  }
  if (
    auth.status === 'authenticated' &&
    auth.user &&
    !auth.user.emailVerifiedAt &&
    pathname !== '/verify-email-pending' &&
    pathname !== '/verify'
  ) {
    return <Redirect href="/verify-email-pending" />;
  }
  if (auth.status === 'authenticated' && inAuth && auth.user?.emailVerifiedAt) {
    return <Redirect href={(next ?? '/welcome') as never} />;
  }
  return <Slot />;
};

export default function RootLayout() {
  useEffect(() => {
    initSentry();
  }, []);
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
  });
  const stripeKey =
    (Constants.expoConfig?.extra as { stripePublishableKey?: string } | undefined)
      ?.stripePublishableKey ?? '';
  if (!stripeKey && __DEV__) {
    // Not thrown: dev builds without Stripe configured should still run
    // screens unrelated to payment. StripeProvider just becomes a no-op.
    console.warn('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — payments will fail.');
  }
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  return (
    <ThemeProvider value={jdmNavTheme}>
      <StripeProvider
        publishableKey={stripeKey}
        merchantIdentifier="merchant.com.jdmexperience.app"
      >
        {/* StoreRuntimeProvider must wrap AuthProvider so the store probe fires
            before auth state settles. The probe uses an unauthenticated endpoint;
            do not move it inside AuthProvider without verifying the probe auth. */}
        <StoreRuntimeProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <Gate />
            <ToastHost />
          </AuthProvider>
        </StoreRuntimeProvider>
      </StripeProvider>
    </ThemeProvider>
  );
}
