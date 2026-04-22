import type { EventDetail, TicketTier } from '@jdm/shared/events';
import { PaymentSheetError, useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getEvent } from '~/api/events';
import { createOrder } from '~/api/orders';
import { Button } from '~/components/Button';
import { eventsCopy } from '~/copy/events';
import { ticketsCopy } from '~/copy/tickets';
import { formatBRL, formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

export default function EventDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return;
    void (async () => {
      try {
        setEvent(await getEvent(slug));
      } catch {
        setError(eventsCopy.errors.notFound);
      }
    })();
  }, [slug]);

  const openMap = (e: EventDetail) => {
    const parts = [e.venueName, e.venueAddress, e.city, e.stateCode].filter(Boolean);
    if (parts.length === 0) return;
    const q = encodeURIComponent(parts.join(', '));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const buy = async (tier: TicketTier) => {
    if (!event) return;
    setPaying(true);
    try {
      const order = await createOrder({ eventId: event.id, tierId: tier.id, method: 'card' });

      const init = await initPaymentSheet({
        merchantDisplayName: 'JDM Experience',
        paymentIntentClientSecret: order.clientSecret,
        applePay: { merchantCountryCode: 'BR' },
        googlePay: { merchantCountryCode: 'BR', testEnv: true },
        defaultBillingDetails: {},
      });
      if (init.error) {
        Alert.alert(ticketsCopy.purchase.error, init.error.message);
        return;
      }

      const sheet = await presentPaymentSheet();
      if (sheet.error) {
        if (sheet.error.code === PaymentSheetError.Canceled) {
          Alert.alert(ticketsCopy.purchase.cancelled);
        } else {
          Alert.alert(ticketsCopy.purchase.error, sheet.error.message);
        }
        return;
      }

      Alert.alert(ticketsCopy.purchase.success, undefined, [
        {
          text: ticketsCopy.purchase.successCta,
          onPress: () => router.push('/tickets' as never),
        },
      ]);
    } catch {
      Alert.alert(ticketsCopy.purchase.error);
    } finally {
      setPaying(false);
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const selectedTier = event.tiers.find((t) => t.id === selectedTierId) ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {event.coverUrl ? (
        <Image source={{ uri: event.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.section}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.sub}>{formatEventDateRange(event.startsAt, event.endsAt)}</Text>
      </View>

      {(() => {
        const locationLine = [event.venueAddress, event.city, event.stateCode]
          .filter(Boolean)
          .join(', ');
        const hasAny = event.venueName || locationLine;
        if (!hasAny) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.h2}>{eventsCopy.detail.venue}</Text>
            {event.venueName ? <Text style={styles.body}>{event.venueName}</Text> : null}
            {locationLine ? <Text style={styles.sub}>{locationLine}</Text> : null}
            <Pressable onPress={() => openMap(event)} style={styles.mapButton}>
              <Text style={styles.mapLabel}>{eventsCopy.detail.openMaps}</Text>
            </Pressable>
          </View>
        );
      })()}

      <View style={styles.section}>
        <Text style={styles.body}>{event.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>{ticketsCopy.purchase.pickTier}</Text>
        {event.tiers.map((t) => {
          const soldOut = t.remainingCapacity === 0;
          const isSelected = selectedTierId === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => !soldOut && setSelectedTierId(t.id)}
              style={[
                styles.tier,
                isSelected && styles.tierSelected,
                soldOut && styles.tierDisabled,
              ]}
            >
              <View style={styles.tierTop}>
                <Text style={styles.tierName}>{t.name}</Text>
                <Text style={styles.tierPrice}>{formatBRL(t.priceCents)}</Text>
              </View>
              <Text style={styles.sub}>
                {soldOut
                  ? ticketsCopy.purchase.soldOut
                  : `${t.remainingCapacity} ${eventsCopy.detail.remaining}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Button
          label={paying ? ticketsCopy.purchase.paying : ticketsCopy.purchase.confirm}
          onPress={() => selectedTier && void buy(selectedTier)}
          disabled={!selectedTier || paying}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: theme.spacing.xl, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: { backgroundColor: theme.colors.border },
  section: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  title: { color: theme.colors.fg, fontSize: theme.font.size.lg, fontWeight: '700' },
  h2: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  body: { color: theme.colors.fg, fontSize: theme.font.size.md },
  sub: { color: theme.colors.muted },
  error: { color: theme.colors.muted },
  mapButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
    alignSelf: 'flex-start',
  },
  mapLabel: { color: theme.colors.fg },
  tier: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tierSelected: { borderColor: theme.colors.fg, borderWidth: 2 },
  tierDisabled: { opacity: 0.5 },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between' },
  tierName: { color: theme.colors.fg, fontWeight: '600' },
  tierPrice: { color: theme.colors.fg },
});
