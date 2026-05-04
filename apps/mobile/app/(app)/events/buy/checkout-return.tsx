import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getOrder } from '~/api/orders';
import { Button } from '~/components/Button';
import { buyCopy } from '~/copy/buy';
import { theme } from '~/theme';

type Status = 'polling' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'error';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

function readWebParams(): { orderId: string | null; cancelled: boolean } {
  if (Platform.OS !== 'web') return { orderId: null, cancelled: false };
  const params = new URLSearchParams(window.location.search);
  const cancelled = params.get('cancelled') === 'true';
  const orderId = params.get('orderId') ?? sessionStorage.getItem('jdm:pendingOrderId');
  return { orderId, cancelled };
}

export default function CheckoutReturnScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('polling');
  const pollCount = useRef(0);

  const { orderId, cancelled } = readWebParams();

  useEffect(() => {
    if (cancelled) {
      setStatus('cancelled');
      return;
    }
    if (!orderId) {
      setStatus('error');
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const order = await getOrder(orderId);
        if (!active) return;

        if (order.status === 'paid') {
          sessionStorage.removeItem('jdm:pendingOrderId');
          setStatus('paid');
          return;
        }
        if (order.status === 'failed' || order.status === 'refunded') {
          sessionStorage.removeItem('jdm:pendingOrderId');
          setStatus('failed');
          return;
        }
        if (order.status === 'expired') {
          sessionStorage.removeItem('jdm:pendingOrderId');
          setStatus('expired');
          return;
        }

        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setStatus('error');
          return;
        }
        setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (active) setStatus('error');
      }
    };

    void poll();
    return () => {
      active = false;
    };
  }, [orderId, cancelled]);

  const hasReachedTerminal = useRef(false);

  useEffect(() => {
    if (status !== 'polling') {
      hasReachedTerminal.current = true;
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      if (hasReachedTerminal.current) {
        router.dismissAll();
      }
    }, [router]),
  );

  const goTickets = () => {
    router.dismissAll();
    router.navigate('/tickets' as never);
  };
  const goEvents = () => {
    router.dismissAll();
  };

  return (
    <View style={styles.container}>
      {status === 'polling' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.heading}>{buyCopy.webCheckout.returnTitle}</Text>
          <Text style={styles.sub}>{buyCopy.webCheckout.processing}</Text>
        </View>
      )}

      {status === 'paid' && (
        <View style={styles.center}>
          <Text style={styles.emoji}>✓</Text>
          <Text style={styles.heading}>{buyCopy.webCheckout.success}</Text>
          <View style={styles.actions}>
            <Button label={buyCopy.webCheckout.successCta} onPress={goTickets} />
          </View>
        </View>
      )}

      {status === 'cancelled' && (
        <View style={styles.center}>
          <Text style={styles.heading}>{buyCopy.webCheckout.cancelled}</Text>
          <Text style={styles.sub}>{buyCopy.webCheckout.cancelledSub}</Text>
          <View style={styles.actions}>
            <Pressable onPress={goEvents}>
              <Text style={styles.link}>{buyCopy.webCheckout.tryAgain}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === 'expired' && (
        <View style={styles.center}>
          <Text style={styles.heading}>{buyCopy.webCheckout.expired}</Text>
          <Text style={styles.sub}>{buyCopy.webCheckout.expiredSub}</Text>
          <View style={styles.actions}>
            <Pressable onPress={goEvents}>
              <Text style={styles.link}>{buyCopy.webCheckout.tryAgain}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === 'failed' && (
        <View style={styles.center}>
          <Text style={styles.heading}>{buyCopy.webCheckout.failed}</Text>
          <Text style={styles.sub}>{buyCopy.webCheckout.failedSub}</Text>
          <View style={styles.actions}>
            <Pressable onPress={goEvents}>
              <Text style={styles.link}>{buyCopy.webCheckout.tryAgain}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.heading}>{buyCopy.webCheckout.errorPolling}</Text>
          <View style={styles.actions}>
            <Pressable onPress={goEvents}>
              <Text style={styles.link}>{buyCopy.webCheckout.tryAgain}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emoji: {
    fontSize: 48,
    color: theme.colors.accent,
    marginBottom: 8,
  },
  heading: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  sub: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
    textAlign: 'center',
  },
  actions: { marginTop: 16, gap: 12 },
  link: {
    color: theme.colors.accent,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    textAlign: 'center',
  },
});
