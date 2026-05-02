import { Tabs } from 'expo-router';
import { CalendarDays, Car, Ticket, UserRound } from 'lucide-react-native';

const ACTIVE = '#E10600';
const INACTIVE = '#8A8A93';

const EventsIcon = ({ color }: { color: string }) => (
  <CalendarDays color={color} size={22} strokeWidth={1.75} />
);
const TicketsIcon = ({ color }: { color: string }) => (
  <Ticket color={color} size={22} strokeWidth={1.75} />
);
const GarageIcon = ({ color }: { color: string }) => (
  <Car color={color} size={22} strokeWidth={1.75} />
);
const ProfileIcon = ({ color }: { color: string }) => (
  <UserRound color={color} size={22} strokeWidth={1.75} />
);

const screenOptions = {
  headerShown: false,
  tabBarActiveTintColor: ACTIVE,
  tabBarInactiveTintColor: INACTIVE,
  tabBarStyle: {
    backgroundColor: '#0a0a0a',
    borderTopColor: '#2A2A2A',
    borderTopWidth: 1,
    height: 64,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabBarLabelStyle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.4,
  },
} as const;

export default function AppLayout() {
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="events" options={{ title: 'Eventos', tabBarIcon: EventsIcon }} />
      <Tabs.Screen name="tickets" options={{ title: 'Ingressos', tabBarIcon: TicketsIcon }} />
      <Tabs.Screen name="garage" options={{ title: 'Garagem', tabBarIcon: GarageIcon }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ProfileIcon }} />
    </Tabs>
  );
}
