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
    pathname.startsWith('/verify-email-pending');

  if (auth.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  if (auth.status === 'unauthenticated' && !inAuth) {
    return <Redirect href="/login" />;
  }
  if (auth.status === 'authenticated' && inAuth) {
    return <Redirect href="/welcome" />;
  }
  if (
    auth.status === 'authenticated' &&
    auth.user &&
    !auth.user.emailVerifiedAt &&
    pathname !== '/verify-email-pending'
  ) {
    return <Redirect href="/verify-email-pending" />;
  }
  return <Slot />;
};

export default function RootLayout() {
  useEffect(() => {
    initSentry();
  }, []);
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate />
    </AuthProvider>
  );
}
