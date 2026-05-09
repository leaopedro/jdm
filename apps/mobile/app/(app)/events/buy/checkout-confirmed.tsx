import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '~/components/Button';
import { buyCopy } from '~/copy/buy';
import { theme } from '~/theme';

export default function CheckoutConfirmedScreen() {
  const router = useRouter();

  const goOrders = () => {
    router.dismissAll();
    router.replace('/profile/orders' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <CheckCircle2 size={96} color={theme.colors.success} strokeWidth={1.75} />
        <Text style={styles.title}>{buyCopy.confirmed.title}</Text>
        <Text style={styles.subtitle}>{buyCopy.confirmed.subtitle}</Text>

        <View style={styles.actions}>
          <Button label={buyCopy.confirmed.viewOrders} onPress={goOrders} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
});
