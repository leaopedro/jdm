import { Stack } from 'expo-router';

export default function EventsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Eventos' }} />
      <Stack.Screen name="[slug]" options={{ title: '' }} />
    </Stack>
  );
}
