import { Stack } from 'expo-router';

export default function TicketsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Meus ingressos' }} />
      <Stack.Screen name="[ticketId]" options={{ title: '' }} />
    </Stack>
  );
}
