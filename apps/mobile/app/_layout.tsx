import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initSentry } from '~/lib/sentry';
import { theme } from '~/theme';

export default function RootLayout() {
  useEffect(() => {
    initSentry();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.fg,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    </>
  );
}
