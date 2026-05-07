import { router, Tabs } from 'expo-router';
import { CalendarDays, Car, ShoppingCart, Ticket, UserRound } from 'lucide-react-native';

import { useCart } from '~/cart/context';
import { CartProvider } from '~/cart/context';
import { cartCopy } from '~/copy/cart';

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
const CartIcon = ({ color }: { color: string }) => (
  <ShoppingCart color={color} size={22} strokeWidth={1.75} />
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
    height: 84,
    paddingTop: 10,
    paddingBottom: 18,
  },
  tabBarLabelStyle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  tabBarIconStyle: {
    marginBottom: 2,
  },
} as const;

function AppTabs() {
  const { itemCount } = useCart();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="events"
        options={{ title: 'Eventos', tabBarIcon: EventsIcon }}
        listeners={{
          tabPress: (e) => {
            // Default tab-press behavior on web preserves dynamic params
            // (e.g. /events?eventSlug=...) which fails to pop deep routes
            // like /events/buy/[eventSlug]. Force a clean replace to /events.
            e.preventDefault();
            router.replace('/events');
          },
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{ title: 'Ingressos', tabBarIcon: TicketsIcon }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace('/tickets');
          },
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{ href: null, title: 'Garagem', tabBarIcon: GarageIcon }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ProfileIcon }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: cartCopy.title,
          tabBarIcon: CartIcon,
          tabBarBadgeStyle: {
            backgroundColor: ACTIVE,
            color: '#F5F5F5',
            fontFamily: 'Inter_700Bold',
            fontSize: 10,
          },
          ...(itemCount > 0 ? { tabBarBadge: cartCopy.badge(itemCount) } : {}),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace('/cart');
          },
        }}
      />
    </Tabs>
  );
}

export default function AppLayout() {
  return (
    <CartProvider>
      <AppTabs />
    </CartProvider>
  );
}
