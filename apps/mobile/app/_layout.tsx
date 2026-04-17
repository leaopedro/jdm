import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { theme } from '~/theme';

export default function RootLayout() {
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
