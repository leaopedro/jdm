import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="events" options={{ title: 'Eventos' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Ingressos' }} />
      <Tabs.Screen name="garage" options={{ title: 'Garagem' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', headerShown: true }} />
    </Tabs>
  );
}
