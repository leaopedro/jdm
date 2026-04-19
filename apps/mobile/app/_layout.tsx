import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AuthProvider, useAuth } from '~/auth/context';
import { initSentry } from '~/lib/sentry';
import { theme } from '~/theme';

const Gate = () => {
  const auth = useAuth();
  const pathname = usePathname();
  const inAuth =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify');

  if (auth.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  if (auth.status === 'unauthenticated' && !inAuth) {
    return <Redirect href="/login" />;
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
    return <Redirect href="/welcome" />;
  }
  return <Slot />;
};

export default function RootLayout() {
  useEffect(() => {
    initSentry();
  }, []);
  const stripeKey =
    (Constants.expoConfig?.extra as { stripePublishableKey?: string } | undefined)
      ?.stripePublishableKey ?? '';
  if (!stripeKey && __DEV__) {
    // Not thrown: dev builds without Stripe configured should still run
    // screens unrelated to payment. StripeProvider just becomes a no-op.
    console.warn('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — payments will fail.');
  }
  return (
    <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.jdmexperience.app">
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </StripeProvider>
  );
}
